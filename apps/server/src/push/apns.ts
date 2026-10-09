import { type ClientHttp2Session, connect } from "node:http2";
import { APNS_JWT_TTL_MS, isCachedTokenFresh, signEs256Jwt } from "./jwt.js";
import {
  APNS_CATEGORY_RELAY_ITEM,
  type PushPayload,
  type PushSender,
  type PushSendResult,
} from "./types.js";

export type ApnsClientOptions = {
  keyPem: string;
  keyId: string;
  teamId: string;
  /** Default topic when the device row has none. */
  defaultTopic: string;
  productionAuthority?: string;
  sandboxAuthority?: string;
  /** Test hook: skip TLS verification against local mock. */
  rejectUnauthorized?: boolean;
  now?: () => number;
};

export type ApnsClient = PushSender & {
  getCachedJwt(): string | null;
  mintJwt(): string;
};

const DEFAULT_PRODUCTION = "https://api.push.apple.com";
const DEFAULT_SANDBOX = "https://api.sandbox.push.apple.com";

export function createApnsClient(opts: ApnsClientOptions): ApnsClient {
  const now = opts.now ?? Date.now;
  let cachedJwt: { value: string; expiresAtMs: number } | null = null;
  const sessions = new Map<string, ClientHttp2Session>();

  function mintJwt(): string {
    const t = now();
    if (isCachedTokenFresh(cachedJwt, t)) return cachedJwt.value;
    const iat = Math.floor(t / 1000);
    const value = signEs256Jwt({
      privateKeyPem: opts.keyPem,
      header: { alg: "ES256", kid: opts.keyId },
      payload: { iss: opts.teamId, iat },
    });
    cachedJwt = { value, expiresAtMs: t + APNS_JWT_TTL_MS };
    return value;
  }

  function authorityFor(environment: "sandbox" | "production"): string {
    if (environment === "sandbox") {
      return opts.sandboxAuthority ?? DEFAULT_SANDBOX;
    }
    return opts.productionAuthority ?? DEFAULT_PRODUCTION;
  }

  function sessionFor(authority: string): ClientHttp2Session {
    const existing = sessions.get(authority);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = connect(authority, {
      rejectUnauthorized: opts.rejectUnauthorized ?? true,
    });
    session.on("error", () => {
      sessions.delete(authority);
    });
    sessions.set(authority, session);
    return session;
  }

  async function send(input: {
    token: string;
    environment: "sandbox" | "production";
    topic: string | null;
    payload: PushPayload;
  }): Promise<PushSendResult> {
    const topic = input.topic?.trim() || opts.defaultTopic;
    const authority = authorityFor(input.environment);
    const session = sessionFor(authority);
    const body: Record<string, unknown> = {
      aps: {
        alert: input.payload.title
          ? { title: "Relay", body: input.payload.title }
          : { title: "Relay" },
        category: APNS_CATEGORY_RELAY_ITEM,
        "thread-id": input.payload.item_id,
        "mutable-content": 0,
      },
      item_id: input.payload.item_id,
      reason: input.payload.reason,
    };
    const jwt = mintJwt();
    return await new Promise<PushSendResult>((resolve) => {
      const req = session.request({
        ":method": "POST",
        ":path": `/3/device/${input.token}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0;
      const chunks: Buffer[] = [];
      req.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("error", (err: Error) => {
        resolve({
          ok: false,
          invalidToken: false,
          error: err.message,
        });
      });
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (status >= 200 && status < 300) {
          resolve({ ok: true });
          return;
        }
        let reason = "";
        try {
          reason = String(
            (JSON.parse(raw) as { reason?: string }).reason ?? raw,
          );
        } catch {
          reason = raw;
        }
        const invalidToken =
          status === 410 ||
          reason === "BadDeviceToken" ||
          reason === "Unregistered";
        resolve({
          ok: false,
          invalidToken,
          status,
          error: reason || `apns_${status}`,
        });
      });
      req.end(JSON.stringify(body));
    });
  }

  function close(): void {
    for (const session of sessions.values()) {
      try {
        session.close();
      } catch {
        // already closed
      }
    }
    sessions.clear();
  }

  return {
    send,
    close,
    getCachedJwt: () => cachedJwt?.value ?? null,
    mintJwt,
  };
}
