import {
  type Device,
  type RelayService,
  UnauthorizedError,
  USER_ACTOR_ID,
} from "@relay/core";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { ClientIpResolver } from "./client_ip.js";
import { requestIsLoopback } from "./client_ip.js";
import { hasProxyHeaders } from "./proxy_headers.js";

export type AuthOptions = {
  requireToken: boolean;
  /**
   * Operator set `RELAY_REQUIRE_TOKEN=1` explicitly — no HTTP loopback
   * exemption for pairing (use CLI `pnpm relay:pair`).
   */
  requireTokenExplicit: boolean;
  publicUrl: string;
  resolveClientIp: ClientIpResolver;
};

declare module "hono" {
  interface ContextVariableMap {
    relayDevice?: Device;
  }
}

/** Paths under /api that stay reachable without a device token. */
const PUBLIC_API_PATHS = new Set(["/api/health", "/api/pair/claim"]);

/**
 * pair/start is reachable without a token only from trusted loopback
 * (not when tokens are explicitly required, and never through a proxy).
 */
const PAIR_START_PATH = "/api/pair/start";

export function extractBearerToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return null;
  return match[1].trim();
}

/**
 * EventSource cannot set Authorization headers. Clients mint a short-lived
 * stream ticket (`POST /api/stream/ticket`) and pass it as `?access_token=`.
 * Never put the long-lived device token in the query string.
 */
export function extractStreamAccessToken(c: Context): string | null {
  const q = c.req.query("access_token");
  if (q && q.length > 0) return q;
  return null;
}

export function authenticateRequest(
  c: Context,
  svc: RelayService,
  opts: { allowStreamTicket?: boolean } = {},
): Device | null {
  const bearer = extractBearerToken(c);
  if (bearer) {
    return svc.authenticateDeviceToken(bearer);
  }
  if (opts.allowStreamTicket) {
    const ticket = extractStreamAccessToken(c);
    if (ticket) return svc.authenticateStreamTicket(ticket);
  }
  return null;
}

function unauthorizedJson(message = "Authentication required"): Response {
  return Response.json(
    { error: "unauthorized", message },
    { status: 401 },
  );
}

/**
 * Trusted loopback exemption: real loopback peer, no proxy headers, and
 * tokens were not forced on via `RELAY_REQUIRE_TOKEN=1`.
 */
export function isTrustedLoopbackRequest(
  c: Context,
  opts: AuthOptions,
): boolean {
  if (opts.requireTokenExplicit) return false;
  if (hasProxyHeaders(c)) return false;
  return requestIsLoopback(c, opts.resolveClientIp);
}

/** Effective token gate for this request (env flag or proxied peer). */
export function requestRequiresToken(c: Context, opts: AuthOptions): boolean {
  if (opts.requireToken) return true;
  return hasProxyHeaders(c);
}

/**
 * When tokens are required (env or proxy headers), reject unauthenticated
 * /api/* (except public paths). On success, attach the device.
 */
export function createAuthMiddleware(
  svc: RelayService,
  opts: AuthOptions,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (c.req.method === "OPTIONS") {
      await next();
      return;
    }
    const isStream = path === "/api/stream";
    const needsToken = requestRequiresToken(c, opts);
    if (!needsToken) {
      const device = authenticateRequest(c, svc, {
        allowStreamTicket: isStream,
      });
      if (device) c.set("relayDevice", device);
      await next();
      return;
    }
    if (PUBLIC_API_PATHS.has(path)) {
      await next();
      return;
    }
    if (path === PAIR_START_PATH) {
      const device = authenticateRequest(c, svc);
      if (device) {
        c.set("relayDevice", device);
        await next();
        return;
      }
      if (isTrustedLoopbackRequest(c, opts)) {
        await next();
        return;
      }
      return unauthorizedJson(
        opts.requireTokenExplicit
          ? "Pairing start requires a device token (use pnpm relay:pair on the host)"
          : "Pairing start requires loopback or a device token",
      );
    }
    const device = authenticateRequest(c, svc, {
      allowStreamTicket: isStream,
    });
    if (!device) {
      return unauthorizedJson();
    }
    c.set("relayDevice", device);
    await next();
  };
}

/**
 * MCP invoke helper — same token gate when tokens are required.
 */
export function createMcpInvokeAuthMiddleware(
  svc: RelayService,
  opts: AuthOptions,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!requestRequiresToken(c, opts)) {
      const device = authenticateRequest(c, svc);
      if (device) c.set("relayDevice", device);
      await next();
      return;
    }
    const device = authenticateRequest(c, svc);
    if (!device) {
      return unauthorizedJson();
    }
    c.set("relayDevice", device);
    await next();
  };
}

/**
 * Stream auth hook for `authorizeStream`. Returns a 401 Response or null.
 */
export function authorizeStreamRequest(
  c: Context,
  svc: RelayService,
  opts: AuthOptions,
): Response | null {
  if (!requestRequiresToken(c, opts)) {
    const device = authenticateRequest(c, svc, { allowStreamTicket: true });
    if (device) c.set("relayDevice", device);
    return null;
  }
  const device = authenticateRequest(c, svc, { allowStreamTicket: true });
  if (!device) {
    return unauthorizedJson();
  }
  c.set("relayDevice", device);
  return null;
}

export function assertPairStartAllowed(
  c: Context,
  opts: AuthOptions,
): void {
  const device = c.get("relayDevice");
  if (device) return;
  if (isTrustedLoopbackRequest(c, opts)) return;
  throw new UnauthorizedError(
    opts.requireTokenExplicit
      ? "Pairing start requires a device token (use pnpm relay:pair on the host)"
      : "Pairing start requires loopback or a device token",
  );
}

/** Device-authenticated UI requests act as the human user. */
export function userActorFromDevice(): { type: "user"; id: string } {
  return { type: "user", id: USER_ACTOR_ID };
}
