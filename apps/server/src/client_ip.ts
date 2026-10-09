import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { isLoopbackAddress } from "./auth_config.js";

export type ClientIpResolver = (c: Context) => string;

/**
 * Best-effort client IP for pairing rate limits + loopback checks.
 * Prefers an explicit override (tests), then Node conninfo, then 127.0.0.1.
 */
export function createClientIpResolver(
  override?: ClientIpResolver,
): ClientIpResolver {
  if (override) return override;
  return (c: Context): string => {
    try {
      const addr = getConnInfo(c).remote.address;
      if (addr) return addr;
    } catch {
      // app.request() / non-node adapters have no conninfo
    }
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    // app.request() in tests has no socket — treat as loopback.
    return "127.0.0.1";
  };
}

export function requestIsLoopback(
  c: Context,
  resolveIp: ClientIpResolver,
): boolean {
  return isLoopbackAddress(resolveIp(c));
}
