import type {
  Device,
  DevicePlatform,
  DevicePushTarget,
  PushEnvironment,
  PushPlatform,
  RegisterPushInput,
} from "../schemas/device.js";
import { createId } from "../schemas/ids.js";
import type { RelayDb } from "./db.js";
import { hashToken, tokensEqual } from "./tokens.js";

type DeviceRow = {
  id: string;
  name: string;
  platform: string;
  token_hash: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  push_platform: string | null;
  push_token: string | null;
  push_environment: string | null;
  push_topic: string | null;
  push_muted: number;
};

const DEVICE_SELECT = `SELECT id, name, platform, token_hash, created_at, last_seen_at, revoked_at,
        push_platform, push_token, push_environment, push_topic, push_muted
     FROM devices`;

function rowToDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform as DevicePlatform,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
    push_platform: (row.push_platform as PushPlatform | null) ?? null,
    push_environment: (row.push_environment as PushEnvironment | null) ?? null,
    push_topic: row.push_topic,
    push_muted: row.push_muted === 1,
    has_push_token: Boolean(row.push_token),
  };
}

export function listDevices(db: RelayDb): Device[] {
  const rows = db
    .prepare(`${DEVICE_SELECT} ORDER BY created_at ASC`)
    .all() as DeviceRow[];
  return rows.map(rowToDevice);
}

export function getDevice(db: RelayDb, id: string): Device | null {
  const row = db
    .prepare(`${DEVICE_SELECT} WHERE id = ?`)
    .get(id) as DeviceRow | undefined;
  return row ? rowToDevice(row) : null;
}

export type CreatedDevice = {
  device: Device;
  /** Plaintext token — returned once; never persisted. */
  token: string;
};

export function createDevice(
  db: RelayDb,
  input: { name: string; platform: DevicePlatform; token: string },
  now: Date = new Date(),
): CreatedDevice {
  const id = createId("dev");
  const tokenHash = hashToken(input.token);
  const iso = now.toISOString();
  db.prepare(
    `INSERT INTO devices (
       id, name, platform, token_hash, created_at, last_seen_at, revoked_at,
       push_platform, push_token, push_environment, push_topic, push_muted
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 0)`,
  ).run(id, input.name, input.platform, tokenHash, iso, iso);
  return {
    device: {
      id,
      name: input.name,
      platform: input.platform,
      created_at: iso,
      last_seen_at: iso,
      revoked_at: null,
      push_platform: null,
      push_environment: null,
      push_topic: null,
      push_muted: false,
      has_push_token: false,
    },
    token: input.token,
  };
}

/** Look up an active (non-revoked) device by plaintext token. */
export function findDeviceByToken(db: RelayDb, token: string): Device | null {
  const tokenHash = hashToken(token);
  const rows = db
    .prepare(`${DEVICE_SELECT} WHERE revoked_at IS NULL`)
    .all() as DeviceRow[];
  for (const row of rows) {
    if (tokensEqual(row.token_hash, tokenHash)) {
      return rowToDevice(row);
    }
  }
  return null;
}

export function touchDeviceLastSeen(
  db: RelayDb,
  id: string,
  now: Date = new Date(),
): void {
  db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(
    now.toISOString(),
    id,
  );
}

export function renameDevice(
  db: RelayDb,
  id: string,
  name: string,
): Device | null {
  const existing = getDevice(db, id);
  if (!existing) return null;
  db.prepare(`UPDATE devices SET name = ? WHERE id = ?`).run(name, id);
  return { ...existing, name };
}

export function revokeDevice(
  db: RelayDb,
  id: string,
  now: Date = new Date(),
): Device | null {
  const existing = getDevice(db, id);
  if (!existing) return null;
  if (existing.revoked_at) return existing;
  const iso = now.toISOString();
  db.prepare(
    `UPDATE devices SET
       revoked_at = ?,
       push_platform = NULL,
       push_token = NULL,
       push_environment = NULL,
       push_topic = NULL
     WHERE id = ?`,
  ).run(iso, id);
  return {
    ...existing,
    revoked_at: iso,
    push_platform: null,
    push_environment: null,
    push_topic: null,
    has_push_token: false,
  };
}

export function registerDevicePush(
  db: RelayDb,
  deviceId: string,
  input: RegisterPushInput,
): Device | null {
  const existing = getDevice(db, deviceId);
  if (!existing || existing.revoked_at) return null;
  const muted =
    input.muted !== undefined ? (input.muted ? 1 : 0) : existing.push_muted ? 1 : 0;
  const topic = input.topic?.trim() || null;
  db.prepare(
    `UPDATE devices SET
       push_platform = ?,
       push_token = ?,
       push_environment = ?,
       push_topic = ?,
       push_muted = ?
     WHERE id = ?`,
  ).run(input.platform, input.token, input.environment, topic, muted, deviceId);
  return getDevice(db, deviceId);
}

export function clearDevicePush(db: RelayDb, deviceId: string): Device | null {
  const existing = getDevice(db, deviceId);
  if (!existing || existing.revoked_at) return null;
  db.prepare(
    `UPDATE devices SET
       push_platform = NULL,
       push_token = NULL,
       push_environment = NULL,
       push_topic = NULL
     WHERE id = ?`,
  ).run(deviceId);
  return getDevice(db, deviceId);
}

/** Active devices with a push token (includes plaintext token for sending). */
export function listDevicePushTargets(db: RelayDb): DevicePushTarget[] {
  const rows = db
    .prepare(
      `${DEVICE_SELECT}
       WHERE revoked_at IS NULL
         AND push_token IS NOT NULL
         AND push_platform IS NOT NULL
         AND push_environment IS NOT NULL`,
    )
    .all() as DeviceRow[];
  return rows.map((row) => ({
    device_id: row.id,
    platform: row.push_platform as PushPlatform,
    token: row.push_token as string,
    environment: row.push_environment as PushEnvironment,
    topic: row.push_topic,
    muted: row.push_muted === 1,
  }));
}

/** Clear push token after provider reports the token is dead (410 / UNREGISTERED). */
export function clearDevicePushByToken(db: RelayDb, pushToken: string): number {
  const result = db
    .prepare(
      `UPDATE devices SET
         push_platform = NULL,
         push_token = NULL,
         push_environment = NULL,
         push_topic = NULL
       WHERE push_token = ?`,
    )
    .run(pushToken);
  return Number(result.changes ?? 0);
}

/** True if any devices row stores this exact plaintext (should always be false). */
export function databaseContainsPlaintextToken(
  db: RelayDb,
  token: string,
): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM devices
       WHERE token_hash = ? OR id = ? OR name = ? OR platform = ?
          OR push_token = ? OR push_topic = ?`,
    )
    .get(token, token, token, token, token, token) as { n: number };
  if (row.n > 0) return true;
  const all = db
    .prepare(
      `SELECT id, name, platform, token_hash, push_token, push_topic FROM devices`,
    )
    .all() as Array<{
    id: string;
    name: string;
    platform: string;
    token_hash: string;
    push_token: string | null;
    push_topic: string | null;
  }>;
  return all.some(
    (r) =>
      r.id === token ||
      r.name === token ||
      r.platform === token ||
      r.token_hash === token ||
      r.push_token === token ||
      r.push_topic === token,
  );
}
