import type { Context } from "hono";

/** Headers that indicate the request came through a reverse proxy. */
const PROXY_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
] as const;

/**
 * True when the request carries proxy / Tailscale identity headers.
 * Behind `tailscale serve` (or any reverse proxy) the TCP peer is 127.0.0.1,
 * so these headers are the only signal that the caller is not truly local.
 */
export function hasProxyHeaders(c: Context): boolean {
  for (const name of PROXY_HEADERS) {
    const value = c.req.header(name);
    if (value !== undefined && value.trim() !== "") return true;
  }
  for (const [key] of c.req.raw.headers) {
    if (key.toLowerCase().startsWith("tailscale-")) return true;
  }
  return false;
}
