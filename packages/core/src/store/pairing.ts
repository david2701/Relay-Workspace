import { DomainError, ValidationError } from "../domain/errors.js";
import {
  type DevicePlatform,
  PAIRING_CODE_TTL_MS,
  PAIRING_MAX_ATTEMPTS,
} from "../schemas/device.js";
import type { RelayDb } from "./db.js";
import { type CreatedDevice, createDevice } from "./devices.js";
import { generateDeviceToken, generatePairingCode } from "./tokens.js";

export type PairingSession = {
  code: string;
  expires_at: string;
  /** QR / deep-link payload. */
  qr: { v: 1; url: string; code: string };
};

type PairingRow = {
  code: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  failed_attempts: number;
  created_by_device_id: string | null;
};

type IpBackoffRow = {
  ip: string;
  fail_count: number;
  blocked_until: string | null;
};

export class PairingRateLimitError extends DomainError {
  constructor(message = "Too many pairing attempts") {
    super("rate_limited", message);
    this.name = "PairingRateLimitError";
  }
}

export class PairingForbiddenError extends DomainError {
  constructor(message = "Pairing start requires loopback or a device token") {
    super("forbidden", message);
    this.name = "PairingForbiddenError";
  }
}

function readPairing(db: RelayDb, code: string): PairingRow | null {
  const row = db
    .prepare(
      `SELECT code, created_at, expires_at, consumed_at, failed_attempts, created_by_device_id
       FROM pairing_codes WHERE code = ?`,
    )
    .get(code) as PairingRow | undefined;
  return row ?? null;
}

function isIpBlocked(db: RelayDb, ip: string, now: Date): boolean {
  const row = db
    .prepare(
      `SELECT ip, fail_count, blocked_until FROM pairing_ip_backoff WHERE ip = ?`,
    )
    .get(ip) as IpBackoffRow | undefined;
  if (!row?.blocked_until) return false;
  return Date.parse(row.blocked_until) > now.getTime();
}

function recordIpFailure(db: RelayDb, ip: string, now: Date): void {
  const row = db
    .prepare(
      `SELECT ip, fail_count, blocked_until FROM pairing_ip_backoff WHERE ip = ?`,
    )
    .get(ip) as IpBackoffRow | undefined;
  const failCount = (row?.fail_count ?? 0) + 1;
  let blockedUntil: string | null = row?.blocked_until ?? null;
  if (failCount >= 5) {
    const minutes = Math.min(15, 2 ** (failCount - 5));
    blockedUntil = new Date(now.getTime() + minutes * 60_000).toISOString();
  }
  db.prepare(
    `INSERT INTO pairing_ip_backoff (ip, fail_count, blocked_until)
     VALUES (?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET fail_count = excluded.fail_count,
       blocked_until = excluded.blocked_until`,
  ).run(ip, failCount, blockedUntil);
}

function clearIpBackoff(db: RelayDb, ip: string): void {
  db.prepare(`DELETE FROM pairing_ip_backoff WHERE ip = ?`).run(ip);
}

function bumpCodeFailure(db: RelayDb, code: string): number {
  db.prepare(
    `UPDATE pairing_codes SET failed_attempts = failed_attempts + 1 WHERE code = ?`,
  ).run(code);
  const row = readPairing(db, code);
  return row?.failed_attempts ?? PAIRING_MAX_ATTEMPTS;
}

export function startPairing(
  db: RelayDb,
  input: { publicUrl: string; createdByDeviceId?: string | null },
  now: Date = new Date(),
): PairingSession {
  const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
  let code = generatePairingCode();
  for (let i = 0; i < 8; i += 1) {
    const existing = readPairing(db, code);
    if (!existing || Date.parse(existing.expires_at) <= now.getTime()) {
      break;
    }
    code = generatePairingCode();
  }
  db.prepare(`DELETE FROM pairing_codes WHERE code = ?`).run(code);
  db.prepare(
    `INSERT INTO pairing_codes
      (code, created_at, expires_at, consumed_at, failed_attempts, created_by_device_id)
     VALUES (?, ?, ?, NULL, 0, ?)`,
  ).run(
    code,
    now.toISOString(),
    expiresAt.toISOString(),
    input.createdByDeviceId ?? null,
  );
  const url = input.publicUrl.replace(/\/$/, "");
  return {
    code,
    expires_at: expiresAt.toISOString(),
    qr: { v: 1, url, code },
  };
}

export function claimPairing(
  db: RelayDb,
  input: {
    code: string;
    device_name: string;
    platform: DevicePlatform;
    clientIp: string;
  },
  now: Date = new Date(),
): CreatedDevice {
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) {
    recordIpFailure(db, input.clientIp, now);
    throw new ValidationError("code must be a 6-digit string", { field: "code" });
  }
  if (isIpBlocked(db, input.clientIp, now)) {
    throw new PairingRateLimitError();
  }
  const name = input.device_name.trim().slice(0, 120);
  if (name.length === 0) {
    throw new ValidationError("device_name is required", {
      field: "device_name",
    });
  }
  const row = readPairing(db, code);
  if (!row) {
    recordIpFailure(db, input.clientIp, now);
    throw new ValidationError("Invalid or expired pairing code", {
      field: "code",
    });
  }
  if (row.failed_attempts >= PAIRING_MAX_ATTEMPTS) {
    recordIpFailure(db, input.clientIp, now);
    throw new PairingRateLimitError(
      "Pairing code locked after too many attempts",
    );
  }
  if (row.consumed_at) {
    bumpCodeFailure(db, code);
    recordIpFailure(db, input.clientIp, now);
    throw new ValidationError("Pairing code already used", { field: "code" });
  }
  if (Date.parse(row.expires_at) <= now.getTime()) {
    bumpCodeFailure(db, code);
    recordIpFailure(db, input.clientIp, now);
    throw new ValidationError("Pairing code expired", { field: "code" });
  }
  const token = generateDeviceToken();
  db.exec("BEGIN");
  try {
    const fresh = readPairing(db, code);
    if (
      !fresh ||
      fresh.consumed_at ||
      Date.parse(fresh.expires_at) <= now.getTime() ||
      fresh.failed_attempts >= PAIRING_MAX_ATTEMPTS
    ) {
      db.exec("ROLLBACK");
      bumpCodeFailure(db, code);
      recordIpFailure(db, input.clientIp, now);
      throw new ValidationError("Invalid or expired pairing code", {
        field: "code",
      });
    }
    const updated = db
      .prepare(
        `UPDATE pairing_codes SET consumed_at = ?
         WHERE code = ? AND consumed_at IS NULL`,
      )
      .run(now.toISOString(), code);
    if (Number(updated.changes) !== 1) {
      db.exec("ROLLBACK");
      recordIpFailure(db, input.clientIp, now);
      throw new ValidationError("Pairing code already used", { field: "code" });
    }
    const created = createDevice(
      db,
      { name, platform: input.platform, token },
      now,
    );
    db.exec("COMMIT");
    clearIpBackoff(db, input.clientIp);
    return created;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore nested rollback
    }
    throw err;
  }
}
