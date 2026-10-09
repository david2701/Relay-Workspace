/**
 * Bind + token-enforcement policy for LAN auth (phase 2).
 *
 * - Loopback bind (`127.0.0.1` / `localhost` / `::1`): tokens optional by default.
 * - Any other bind (`0.0.0.0`, LAN IP): tokens required (or refuse to start).
 * - `RELAY_REQUIRE_TOKEN` overrides the default when set to `1`/`0`/`true`/`false`.
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
  /** Public base URL embedded in pairing QR payloads. */
  publicUrl: string;
};

export function resolveAuthBindConfig(input: {
  host: string;
  port: number;
  requireTokenEnv?: string;
  publicUrlEnv?: string;
}): AuthBindConfig {
  const loopback = isLoopbackHost(input.host);
  const flag = parseRequireTokenFlag(input.requireTokenEnv);
  const requireToken = flag ?? !loopback;
  if (!loopback && !requireToken) {
    throw new Error(
      "Security: non-loopback RELAY_HOST requires token auth (unset RELAY_REQUIRE_TOKEN=0 or bind 127.0.0.1)",
    );
  }
  const publicUrl =
    input.publicUrlEnv?.replace(/\/$/, "") ||
    `http://${loopback ? "127.0.0.1" : input.host}:${input.port}`;
  return {
    host: input.host,
    requireToken,
    publicUrl,
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
