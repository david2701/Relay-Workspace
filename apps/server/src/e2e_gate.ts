import type { Context } from "hono";
import type { AuthOptions } from "./auth.js";
import {
  type ClientIpResolver,
  createClientIpResolver,
  requestIsLoopback,
} from "./client_ip.js";
import { hasProxyHeaders } from "./proxy_headers.js";

/**
 * Test-only routes (POST /api/store/e2e-reset) require:
 * 1. Server started with RELAY_E2E=1 (route not registered otherwise)
 * 2. Trusted loopback peer — no proxy / Tailscale headers
 *
 * Production cannot enable this by accident: missing env → no route;
 * proxied or non-loopback → 403 even when the flag is set.
 */
export function rejectUnlessE2eLoopback(
  c: Context,
  auth?: AuthOptions,
): Response | null {
  if (hasProxyHeaders(c)) {
    return Response.json(
      {
        error: "forbidden",
        message: "e2e-reset refuses proxied requests",
      },
      { status: 403 },
    );
  }
  const resolveIp: ClientIpResolver =
    auth?.resolveClientIp ?? createClientIpResolver();
  if (!requestIsLoopback(c, resolveIp)) {
    return Response.json(
      {
        error: "forbidden",
        message: "e2e-reset requires loopback client",
      },
      { status: 403 },
    );
  }
  return null;
}
