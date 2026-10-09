import { createHash } from "node:crypto";
import type { RelayDb } from "./db.js";

/** Idempotency-Key rows expire after 24 hours. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyRecord = {
  key: string;
  method: string;
  path: string;
  body_hash: string;
  status_code: number;
  response_body: string;
  created_at: string;
};

export function hashRequestBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function isExpired(createdAt: string, now: Date): boolean {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) return true;
  return now.getTime() - createdMs >= IDEMPOTENCY_TTL_MS;
}

/** Delete rows older than the TTL. Returns the number of deleted rows. */
export function cleanupExpiredIdempotencyKeys(
  db: RelayDb,
  now: Date = new Date(),
): number {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_MS).toISOString();
  const result = db
    .prepare(`DELETE FROM idempotency_keys WHERE created_at < ?`)
    .run(cutoff);
  return Number(result.changes);
}

export function lookupIdempotencyKey(
  db: RelayDb,
  input: { key: string; method: string; path: string },
  now: Date = new Date(),
): IdempotencyRecord | null {
  const row = db
    .prepare(
      `SELECT key, method, path, body_hash, status_code, response_body, created_at
       FROM idempotency_keys
       WHERE key = ? AND method = ? AND path = ?`,
    )
    .get(input.key, input.method, input.path) as IdempotencyRecord | undefined;
  if (!row) return null;
  if (isExpired(row.created_at, now)) {
    db.prepare(
      `DELETE FROM idempotency_keys WHERE key = ? AND method = ? AND path = ?`,
    ).run(input.key, input.method, input.path);
    return null;
  }
  return row;
}

export function storeIdempotencyKey(
  db: RelayDb,
  record: Omit<IdempotencyRecord, "created_at"> & { created_at?: string },
): void {
  const created_at = record.created_at ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO idempotency_keys
       (key, method, path, body_hash, status_code, response_body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, method, path) DO UPDATE SET
       body_hash = excluded.body_hash,
       status_code = excluded.status_code,
       response_body = excluded.response_body,
       created_at = excluded.created_at`,
  ).run(
    record.key,
    record.method,
    record.path,
    record.body_hash,
    record.status_code,
    record.response_body,
    created_at,
  );
}
