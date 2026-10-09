import {
  hashRequestBody,
  lookupIdempotencyKey,
  type RelayService,
  storeIdempotencyKey,
} from "@relay/core";
import type { Context, MiddlewareHandler, Next } from "hono";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Optional Idempotency-Key on mutating /api routes.
 * Same key + same body → replay stored response (24h).
 * Same key + different body → 422.
 */
export function idempotencyMiddleware(svc: RelayService): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    if (!MUTATING.has(method)) {
      await next();
      return;
    }
    const key = c.req.header("Idempotency-Key")?.trim();
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
