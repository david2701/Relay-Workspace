import type { Device, DevicePlatform } from "../schemas/device.js";
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
};

function rowToDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform as DevicePlatform,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
  };
}

export function listDevices(db: RelayDb): Device[] {
  const rows = db
    .prepare(
      `SELECT id, name, platform, token_hash, created_at, last_seen_at, revoked_at
       FROM devices
       ORDER BY created_at ASC`,
    )
    .all() as DeviceRow[];
  return rows.map(rowToDevice);
}

export function getDevice(db: RelayDb, id: string): Device | null {
  const row = db
    .prepare(
      `SELECT id, name, platform, token_hash, created_at, last_seen_at, revoked_at
       FROM devices WHERE id = ?`,
    )
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
    `INSERT INTO devices (id, name, platform, token_hash, created_at, last_seen_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(id, input.name, input.platform, tokenHash, iso, iso);
  return {
    device: {
      id,
      name: input.name,
      platform: input.platform,
      created_at: iso,
      last_seen_at: iso,
      revoked_at: null,
    },
    token: input.token,
  };
}

/** Look up an active (non-revoked) device by plaintext token. */
export function findDeviceByToken(db: RelayDb, token: string): Device | null {
  const tokenHash = hashToken(token);
  const rows = db
    .prepare(
      `SELECT id, name, platform, token_hash, created_at, last_seen_at, revoked_at
       FROM devices WHERE revoked_at IS NULL`,
    )
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
  db.prepare(`UPDATE devices SET revoked_at = ? WHERE id = ?`).run(iso, id);
  return { ...existing, revoked_at: iso };
}

/** True if any devices row stores this exact plaintext (should always be false). */
export function databaseContainsPlaintextToken(
  db: RelayDb,
  token: string,
): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM devices
       WHERE token_hash = ? OR id = ? OR name = ? OR platform = ?`,
    )
    .get(token, token, token, token) as { n: number };
  if (row.n > 0) return true;
  // Scan all text columns for accidental plaintext persistence.
  const all = db
    .prepare(`SELECT id, name, platform, token_hash FROM devices`)
    .all() as Array<{
    id: string;
    name: string;
    platform: string;
    token_hash: string;
  }>;
  return all.some(
    (r) =>
      r.id === token ||
      r.name === token ||
      r.platform === token ||
      r.token_hash === token,
  );
}
