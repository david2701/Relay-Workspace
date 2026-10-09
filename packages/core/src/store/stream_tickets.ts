import { STREAM_TICKET_TTL_MS } from "../schemas/device.js";
import type { RelayDb } from "./db.js";
import { generateDeviceToken, hashToken, tokensEqual } from "./tokens.js";

type TicketRow = {
  token_hash: string;
  device_id: string;
  expires_at: string;
  created_at: string;
};

export type StreamTicket = {
  token: string;
  expires_at: string;
  expires_in: number;
  device_id: string;
};

export function mintStreamTicket(
  db: RelayDb,
  deviceId: string,
  now: Date = new Date(),
): StreamTicket {
  const token = generateDeviceToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + STREAM_TICKET_TTL_MS);
  // Drop expired tickets opportunistically.
  db.prepare(`DELETE FROM stream_tickets WHERE expires_at <= ?`).run(
    now.toISOString(),
  );
  db.prepare(
    `INSERT INTO stream_tickets (token_hash, device_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(tokenHash, deviceId, expiresAt.toISOString(), now.toISOString());
  return {
    token,
    expires_at: expiresAt.toISOString(),
    expires_in: Math.floor(STREAM_TICKET_TTL_MS / 1000),
    device_id: deviceId,
  };
}

export function findDeviceIdByStreamTicket(
  db: RelayDb,
  token: string,
  now: Date = new Date(),
): string | null {
  const tokenHash = hashToken(token);
  const rows = db
    .prepare(
      `SELECT token_hash, device_id, expires_at, created_at FROM stream_tickets
       WHERE expires_at > ?`,
    )
    .all(now.toISOString()) as TicketRow[];
  for (const row of rows) {
    if (tokensEqual(row.token_hash, tokenHash)) {
      return row.device_id;
    }
  }
  return null;
}
