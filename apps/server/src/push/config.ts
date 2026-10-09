import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { FcmServiceAccount } from "./fcm.js";

export type PushRuntimeConfig = {
  /** False when neither APNs nor FCM credentials are configured. */
  enabled: boolean;
  /**
   * When true (default), omit item titles from provider payloads (D3: Apple /
   * Google must not see titles). Only `RELAY_PUSH_REDACT=0` includes titles.
   */
  redact: boolean;
  /** D4: skip push when the device has an open SSE stream. */
  skipOpenSse: boolean;
  dedupeWindowMs: number;
  reminderPollMs: number;
  apns: {
    keyPem: string;
    keyId: string;
    teamId: string;
    topic: string;
  } | null;
  fcm: FcmServiceAccount | null;
};

/** Default ON; titles only when the operator explicitly sets `0` / `false`. */
export function parsePushRedactEnv(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return true;
  const v = raw.toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

function readOptionalFile(path: string | undefined): string | null {
  if (!path) return null;
  if (!existsSync(path)) {
    throw new Error(`Push credentials file not found: ${path}`);
  }
  return readFileSync(path, "utf8");
}

function parseFcmCredentials(raw: string): FcmServiceAccount {
  const parsed = JSON.parse(raw) as Partial<FcmServiceAccount>;
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error(
      "FCM credentials JSON must include client_email, private_key, project_id",
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    project_id: parsed.project_id,
  };
}

/**
 * Resolve push config from env. Missing credentials → disabled (no throw).
 * Invalid *present* credential paths/JSON still throw so misconfig is obvious.
 */
export function loadPushConfig(
  env: NodeJS.ProcessEnv = process.env,
): PushRuntimeConfig {
  const redact = parsePushRedactEnv(env.RELAY_PUSH_REDACT);
  const skipOpenSseRaw = env.RELAY_PUSH_SKIP_OPEN_SSE;
  const skipOpenSse =
    skipOpenSseRaw === undefined || skipOpenSseRaw === ""
      ? true
      : skipOpenSseRaw === "1" || skipOpenSseRaw.toLowerCase() === "true";
  const dedupeWindowMs = z.coerce
    .number()
    .int()
    .positive()
    .default(60_000)
    .parse(env.RELAY_PUSH_DEDUPE_MS ?? 60_000);
  const reminderPollMs = z.coerce
    .number()
    .int()
    .positive()
    .default(15_000)
    .parse(env.RELAY_PUSH_REMINDER_POLL_MS ?? 15_000);

  const apnsKeyPath = env.RELAY_APNS_KEY_PATH;
  const apnsKeyId = env.RELAY_APNS_KEY_ID;
  const apnsTeamId = env.RELAY_APNS_TEAM_ID;
  const apnsTopic = env.RELAY_APNS_TOPIC;
  const apnsParts = [apnsKeyPath, apnsKeyId, apnsTeamId, apnsTopic];
  const apnsAny = apnsParts.some((v) => Boolean(v));
  const apnsAll = apnsParts.every((v) => Boolean(v));
  let apns: PushRuntimeConfig["apns"] = null;
  if (apnsAll) {
    const keyPem = readOptionalFile(apnsKeyPath);
    if (keyPem) {
      apns = {
        keyPem,
        keyId: apnsKeyId as string,
        teamId: apnsTeamId as string,
        topic: apnsTopic as string,
      };
    }
  } else if (apnsAny) {
    throw new Error(
      "APNs config incomplete: set RELAY_APNS_KEY_PATH, RELAY_APNS_KEY_ID, RELAY_APNS_TEAM_ID, RELAY_APNS_TOPIC",
    );
  }

  const fcmPath = env.RELAY_FCM_CREDENTIALS_PATH;
  let fcm: FcmServiceAccount | null = null;
  if (fcmPath) {
    const raw = readOptionalFile(fcmPath);
    if (raw) fcm = parseFcmCredentials(raw);
  }

  return {
    enabled: apns !== null || fcm !== null,
    redact,
    skipOpenSse,
    dedupeWindowMs,
    reminderPollMs,
    apns,
    fcm,
  };
}

/** One startup line when push cannot send. */
export function formatPushDisabledLog(): string {
  return "Push: disabled (no APNs/FCM credentials)";
}

export function formatPushEnabledLog(cfg: PushRuntimeConfig): string {
  const parts: string[] = [];
  if (cfg.apns) parts.push("apns");
  if (cfg.fcm) parts.push("fcm");
  return `Push: enabled (${parts.join(", ")}) redact=${cfg.redact ? 1 : 0} skip_open_sse=${cfg.skipOpenSse ? 1 : 0}`;
}
