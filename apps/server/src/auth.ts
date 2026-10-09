import {
  type Device,
  type RelayService,
  UnauthorizedError,
  USER_ACTOR_ID,
} from "@relay/core";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { ClientIpResolver } from "./client_ip.js";
import { requestIsLoopback } from "./client_ip.js";

export type AuthOptions = {
  requireToken: boolean;
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
 * pair/start is reachable without a token only from loopback; the handler
 * (or this gate) still requires loopback OR an authenticated device.
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
 * When `requireToken` is true, reject unauthenticated /api/* (except public
 * paths). On success, attach the device.
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
    if (!opts.requireToken) {
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
      if (requestIsLoopback(c, opts.resolveClientIp)) {
        await next();
        return;
      }
      return unauthorizedJson(
        "Pairing start requires loopback or a device token",
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
 * MCP invoke helper — same token gate when requireToken is on.
 */
export function createMcpInvokeAuthMiddleware(
  svc: RelayService,
  opts: AuthOptions,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!opts.requireToken) {
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
  if (!opts.requireToken) {
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
  if (requestIsLoopback(c, opts.resolveClientIp)) return;
  throw new UnauthorizedError(
    "Pairing start requires loopback or a device token",
  );
}

/** Device-authenticated UI requests act as the human user. */
export function userActorFromDevice(): { type: "user"; id: string } {
  return { type: "user", id: USER_ACTOR_ID };
}
