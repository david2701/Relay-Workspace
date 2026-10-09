/**
 * Bind + token-enforcement policy for LAN auth (phase 2).
 *
 * - Loopback bind (`127.0.0.1` / `localhost` / `::1`) with no public URL (or a
 *   loopback public URL): tokens optional by default.
 * - Non-loopback bind (`0.0.0.0`, LAN IP): tokens required (or refuse to start).
 * - Loopback bind + non-loopback `RELAY_PUBLIC_URL`: tokens required as if
 *   `RELAY_REQUIRE_TOKEN=1` (no HTTP loopback exemption for `pair/start`) —
 *   closes reverse proxies that add no proxy headers.
 * - `RELAY_REQUIRE_TOKEN` overrides the default when set to `1`/`0`/`true`/`false`.
 * - When the flag is **explicitly** `1`/`true`, there is no loopback HTTP exemption
 *   for pairing — use `pnpm relay:pair` (CLI → SQLite) instead.
 */

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return (
    h === "127.0.0.1" ||
    h === "localhost" ||
    h === "::1" ||
    h === "[::1]"
  );
}

/** Hostname from a public base URL (strips brackets from IPv6 literals). */
export function hostnameFromPublicUrl(publicUrl: string): string | null {
  try {
    const host = new URL(publicUrl).hostname.trim().toLowerCase();
    if (!host) return null;
    return host.startsWith("[") && host.endsWith("]")
      ? host.slice(1, -1)
      : host;
  } catch {
    return null;
  }
}

export function isLoopbackPublicUrl(publicUrl: string): boolean {
  const host = hostnameFromPublicUrl(publicUrl);
  if (host === null) return false;
  return isLoopbackHost(host);
}

export function parseRequireTokenFlag(
  raw: string | undefined,
): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  throw new Error(
    `Invalid RELAY_REQUIRE_TOKEN=${JSON.stringify(raw)} (use 0/1 or true/false)`,
  );
}

export type AuthBindConfig = {
  host: string;
  /** Effective enforcement flag after defaults. */
  requireToken: boolean;
  /**
   * True when the operator set `RELAY_REQUIRE_TOKEN` to on, or when a
   * non-loopback `RELAY_PUBLIC_URL` forces the same policy on a loopback bind.
   * Disables the loopback HTTP exemption for `pair/start`.
   */
  requireTokenExplicit: boolean;
  /** Public base URL embedded in pairing QR payloads. */
  publicUrl: string;
  /** One-line label for the effective auth mode (startup log; never tokens). */
  authModeNotice: string;
};

function refuseTokenOffMessage(input: {
  nonLoopbackBind: boolean;
  exposedViaPublicUrl: boolean;
}): string {
  if (input.exposedViaPublicUrl) {
    return (
      "Security: non-loopback RELAY_PUBLIC_URL requires token auth " +
      "(unset RELAY_REQUIRE_TOKEN=0, or set RELAY_PUBLIC_URL to a loopback URL)"
    );
  }
  return (
    "Security: non-loopback RELAY_HOST requires token auth " +
    "(unset RELAY_REQUIRE_TOKEN=0 or bind 127.0.0.1)"
  );
}

function buildAuthModeNotice(input: {
  requireToken: boolean;
  requireTokenExplicit: boolean;
  nonLoopbackBind: boolean;
  exposedViaPublicUrl: boolean;
  flag: boolean | undefined;
}): string {
  if (!input.requireToken) {
    return "Auth mode: open (loopback; tokens optional)";
  }
  if (input.flag === true) {
    return "Auth mode: tokens required (RELAY_REQUIRE_TOKEN=1)";
  }
  if (input.exposedViaPublicUrl && !input.nonLoopbackBind) {
    return "Auth mode: tokens required (non-loopback RELAY_PUBLIC_URL; as RELAY_REQUIRE_TOKEN=1)";
  }
  if (input.nonLoopbackBind) {
    return "Auth mode: tokens required (non-loopback RELAY_HOST)";
  }
  return "Auth mode: tokens required";
}

export function resolveAuthBindConfig(input: {
  host: string;
  port: number;
  requireTokenEnv?: string;
  publicUrlEnv?: string;
}): AuthBindConfig {
  const loopbackBind = isLoopbackHost(input.host);
  const nonLoopbackBind = !loopbackBind;
  const inferredPublic = `http://${loopbackBind ? "127.0.0.1" : input.host}:${input.port}`;
  const publicUrlEnv = input.publicUrlEnv?.replace(/\/$/, "");
  const publicUrl = publicUrlEnv || inferredPublic;
  const exposedViaPublicUrl = Boolean(publicUrlEnv) && !isLoopbackPublicUrl(publicUrl);
  const mustRequireToken = nonLoopbackBind || exposedViaPublicUrl;
  const flag = parseRequireTokenFlag(input.requireTokenEnv);
  if (mustRequireToken && flag === false) {
    throw new Error(
      refuseTokenOffMessage({ nonLoopbackBind, exposedViaPublicUrl }),
    );
  }
  const requireToken = flag ?? mustRequireToken;
  // Non-loopback PUBLIC_URL on a loopback bind is treated as explicit REQUIRE_TOKEN=1
  // so pair/start has no HTTP loopback exemption (proxies without forwarded headers).
  const requireTokenExplicit =
    flag === true || (exposedViaPublicUrl && loopbackBind);
  const authModeNotice = buildAuthModeNotice({
    requireToken,
    requireTokenExplicit,
    nonLoopbackBind,
    exposedViaPublicUrl,
    flag,
  });
  return {
    host: input.host,
    requireToken,
    requireTokenExplicit,
    publicUrl,
    authModeNotice,
  };
}

export function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  const a = addr.trim().toLowerCase();
  return (
    a === "127.0.0.1" ||
    a === "::1" ||
    a === "localhost" ||
    a === "::ffff:127.0.0.1"
  );
}
