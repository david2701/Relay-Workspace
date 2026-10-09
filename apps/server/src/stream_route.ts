import { ValidationError } from "@relay/core";
import type { Context } from "hono";
import type { AuthOptions } from "./auth.js";
import { authorizeStreamRequest } from "./auth.js";
import { MAX_AFTER_SEQ, parseEventPageQuery } from "./event_query.js";
import type { SseHub } from "./sse_hub.js";

function newClientId(): string {
  return `sse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type StreamAuthContext = {
  svc: import("@relay/core").RelayService;
  auth: AuthOptions;
};

/**
 * Require a bearer token or short-lived `?access_token=` stream ticket when
 * `requireToken` is on. Return a Response to reject; return null to allow.
 */
export function authorizeStream(
  c: Context,
  ctx?: StreamAuthContext,
): Response | null {
  if (!ctx) {
    // Tests / legacy callers without auth context — allow (loopback default).
    return null;
  }
  return authorizeStreamRequest(c, ctx.svc, ctx.auth);
}

/**
 * Parse cursor from `Last-Event-ID` or `?after_seq=` (same rules as event pages).
 */
export function parseStreamAfterSeq(c: Context): number {
  const header = c.req.header("Last-Event-ID");
  const query = c.req.query("after_seq");
  const raw = header !== undefined && header !== "" ? header : query;
  if (raw === undefined || raw === "") return 0;
  try {
    const parsed = parseEventPageQuery({ after_seq: raw });
    return parsed.after_seq ?? 0;
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new ValidationError(
        `Last-Event-ID/after_seq must be a safe integer between 0 and ${MAX_AFTER_SEQ}`,
      );
    }
    throw err;
  }
}

export function createStreamHandler(
  hub: SseHub,
  authCtx?: StreamAuthContext,
) {
  return async (c: Context): Promise<Response> => {
    const denied = authorizeStream(c, authCtx);
    if (denied) return denied;

    let afterSeq: number;
    try {
      afterSeq = parseStreamAfterSeq(c);
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json({ error: err.code, message: err.message }, 400);
      }
      throw err;
    }

    if (hub.size >= hub.maxConnections) {
      return c.json(
        {
          error: "service_unavailable",
          message: `SSE connection limit reached (${hub.maxConnections})`,
        },
        503,
      );
    }

    const clientId = newClientId();
    const deviceId = c.get("relayDevice")?.id ?? null;
    const encoder = new TextEncoder();
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      hub.detach(clientId);
    };

    c.req.raw.signal.addEventListener("abort", cleanup);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sink = {
          id: clientId,
          send: (chunk: string) => {
            controller.enqueue(encoder.encode(chunk));
          },
          close: () => {
            try {
              controller.close();
            } catch {
              // already closed
            }
          },
        };
        void hub.attach(sink, afterSeq, { deviceId }).catch(() => {
          cleanup();
          try {
            controller.close();
          } catch {
            // ignore
          }
        });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Disable proxy buffering (nginx etc.).
        "X-Accel-Buffering": "no",
      },
    });
  };
}
