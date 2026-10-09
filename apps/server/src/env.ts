import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { type AuthBindConfig, resolveAuthBindConfig } from "./auth_config.js";

function defaultDbPath(): string {
  const candidates = [
    resolve(process.cwd(), "data/relay.db"),
    resolve(process.cwd(), "../../data/relay.db"),
  ];
  for (const p of candidates) {
    if (existsSync(resolve(p, ".."))) return p;
  }
  return candidates[0] ?? resolve(process.cwd(), "data/relay.db");
}

const EnvSchema = z.object({
  RELAY_HOST: z.string().default("127.0.0.1"),
  RELAY_PORT: z.coerce.number().int().positive().default(7420),
  RELAY_DB: z.string().default(defaultDbPath()),
  RELAY_WEB_ORIGIN: z.string().default("http://127.0.0.1:7421"),
  /** Max concurrent GET /api/stream clients (503 beyond). */
  RELAY_SSE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(50),
  /** Replay gap above this emits `event: resync`. */
  RELAY_SSE_RESYNC_THRESHOLD: z.coerce.number().int().positive().default(5000),
  /** Server-side MAX(seq) poll for cross-process fan-out (ms). */
  RELAY_SSE_WATCH_MS: z.coerce.number().int().positive().default(250),
  /**
   * Force token auth on/off. Default: true when bind is non-loopback,
   * false on loopback. Non-loopback + false is rejected at startup.
   */
  RELAY_REQUIRE_TOKEN: z.string().optional(),
  /** Base URL embedded in pairing QR (e.g. http://192.168.1.10:7420). */
  RELAY_PUBLIC_URL: z.string().optional(),
  /** APNs token-auth (.p8) — see docs/deploy/push.md. Never commit keys. */
  RELAY_APNS_KEY_PATH: z.string().optional(),
  RELAY_APNS_KEY_ID: z.string().optional(),
  RELAY_APNS_TEAM_ID: z.string().optional(),
  RELAY_APNS_TOPIC: z.string().optional(),
  /** FCM HTTP v1 service-account JSON path. */
  RELAY_FCM_CREDENTIALS_PATH: z.string().optional(),
  /**
   * Omit item titles from push payloads (default ON / D3). Titles are included
   * only when the value is exactly `0` or `false` (case-insensitive).
   */
  RELAY_PUSH_REDACT: z.string().optional(),
  /**
   * When "1"/true (default), skip push if the device has an open SSE stream
   * (owner decision D4). Set "0" to always push.
   */
  RELAY_PUSH_SKIP_OPEN_SSE: z.string().optional(),
  /** Dedupe window for (device, item, reason) in ms (default 60000). */
  RELAY_PUSH_DEDUPE_MS: z.string().optional(),
  /** How often to emit reminder_fired for due reminders (ms, default 15000). */
  RELAY_PUSH_REMINDER_POLL_MS: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & {
  auth: AuthBindConfig;
};

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse({
    ...env,
    RELAY_DB: env.RELAY_DB ?? defaultDbPath(),
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  const data = parsed.data;
  const requireTokenEnv =
    data.RELAY_REQUIRE_TOKEN ?? env.RELAY_REQUIRE_TOKEN;
  const publicUrlEnv = data.RELAY_PUBLIC_URL ?? env.RELAY_PUBLIC_URL;
  const auth = resolveAuthBindConfig({
    host: data.RELAY_HOST,
    port: data.RELAY_PORT,
    ...(requireTokenEnv !== undefined ? { requireTokenEnv } : {}),
    ...(publicUrlEnv !== undefined ? { publicUrlEnv } : {}),
  });
  return { ...data, auth };
}
