import {
  hashRequestBody,
  lookupIdempotencyKey,
  type RelayService,
  storeIdempotencyKey,
} from "@relay/core";
import type { Context, MiddlewareHandler, Next } from "hono";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Visible ASCII (no space/controls), 1..256 chars. */
const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{1,256}$/;

/**
 * Parse optional Idempotency-Key header.
 * Absent / blank → null. Malformed → throws with message for 400 validation_error.
 */
export function parseIdempotencyKeyHeader(
  raw: string | undefined,
): string | null {
  if (raw === undefined) return null;
  const key = raw.trim();
  if (key.length === 0) return null;
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    throw new Error("IDEMPOTENCY_KEY_INVALID");
  }
  return key;
}

/**
 * Optional Idempotency-Key on mutating /api routes.
 * Same key + same body → replay stored response (24h).
 * Same key + different body → 422.
 * Malformed key → 400 validation_error.
 */
export function idempotencyMiddleware(svc: RelayService): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    if (!MUTATING.has(method)) {
      await next();
      return;
    }
    let key: string | null;
    try {
      key = parseIdempotencyKeyHeader(c.req.header("Idempotency-Key"));
    } catch {
      return c.json(
        {
          error: "validation_error",
          message:
            "Idempotency-Key must be 1..256 visible ASCII characters (no spaces)",
        },
        400,
      );
    }
    if (!key) {
      await next();
      return;
    }
    const path = new URL(c.req.url).pathname;
    const rawBody = await c.req.raw.clone().text();
    const body_hash = hashRequestBody(rawBody);
    const existing = lookupIdempotencyKey(svc.db, { key, method, path });
    if (existing) {
      if (existing.body_hash !== body_hash) {
        return c.json(
          {
            error: "idempotency_key_reused",
            message:
              "Idempotency-Key was already used with a different request body",
          },
          422,
        );
      }
      return new Response(existing.response_body, {
        status: existing.status_code,
        headers: { "Content-Type": "application/json" },
      });
    }
    await next();
    const res = c.res;
    if (!res || res.status >= 500) return;
    const response_body = await res.clone().text();
    storeIdempotencyKey(svc.db, {
      key,
      method,
      path,
      body_hash,
      status_code: res.status,
      response_body,
    });
  };
}
