import { nowIso } from "../domain/time.js";
import { createId } from "../schemas/ids.js";
import type { ItemEvent, ItemEventType } from "../schemas/item_event.js";
import type { Actor } from "../schemas/work_item.js";
import type { RelayDb } from "./db.js";

export type AppendEventInput = {
  itemId: string;
  type: ItemEventType;
  actor: Actor;
  payload?: Record<string, unknown>;
  at?: Date;
};

type EventRow = {
  id: string;
  seq: number;
  item_id: string;
  type: string;
  actor_kind: string;
  actor_id: string;
  payload: string;
  created_at: string;
};

function rowToEvent(row: EventRow): ItemEvent {
  return {
    id: row.id,
    seq: row.seq,
    item_id: row.item_id,
    type: row.type as ItemEvent["type"],
    actor_kind: row.actor_kind as ItemEvent["actor_kind"],
    actor_id: row.actor_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    created_at: row.created_at,
  };
}

/**
 * Allocate the next global seq and insert an item_events row.
 * Must run inside the same transaction as the mutating write.
 */
export function appendItemEvent(
  db: RelayDb,
  input: AppendEventInput,
): ItemEvent {
  const seqRow = db
    .prepare(`SELECT next_seq AS seq FROM event_seq WHERE id = 1`)
    .get() as { seq: number };
  const seq = seqRow.seq;
  db.prepare(`UPDATE event_seq SET next_seq = ? WHERE id = 1`).run(seq + 1);
  const event: ItemEvent = {
    id: createId("evt"),
    seq,
    item_id: input.itemId,
    type: input.type,
    actor_kind: input.actor.type,
    actor_id: input.actor.id,
    payload: input.payload ?? {},
    created_at: nowIso(input.at ?? new Date()),
  };
  db.prepare(
    `INSERT INTO item_events
       (id, seq, item_id, type, actor_kind, actor_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.seq,
    event.item_id,
    event.type,
    event.actor_kind,
    event.actor_id,
    JSON.stringify(event.payload),
    event.created_at,
  );
  return event;
}

export function latestEventSeq(db: RelayDb): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM item_events`)
    .get() as { seq: number };
  return row.seq;
}

export type ListEventsOpts = {
  afterSeq?: number;
  limit?: number;
  itemId?: string;
};

export function listItemEvents(
  db: RelayDb,
  opts: ListEventsOpts = {},
): { events: ItemEvent[]; has_more: boolean } {
  const afterSeq = opts.afterSeq ?? 0;
  const limit = opts.limit ?? 100;
  const itemId = opts.itemId;
  const rows = (
    itemId
      ? (db
          .prepare(
            `SELECT id, seq, item_id, type, actor_kind, actor_id, payload, created_at
             FROM item_events
             WHERE item_id = ? AND seq > ?
             ORDER BY seq ASC
             LIMIT ?`,
          )
          .all(itemId, afterSeq, limit + 1) as EventRow[])
      : (db
          .prepare(
            `SELECT id, seq, item_id, type, actor_kind, actor_id, payload, created_at
             FROM item_events
             WHERE seq > ?
             ORDER BY seq ASC
             LIMIT ?`,
          )
          .all(afterSeq, limit + 1) as EventRow[])
  );
  const has_more = rows.length > limit;
  const page = has_more ? rows.slice(0, limit) : rows;
  return { events: page.map(rowToEvent), has_more };
}

/** Distinct item ids that received any event with seq > afterSeq. */
export function itemIdsWithEventsAfter(db: RelayDb, afterSeq: number): Set<string> {
  const rows = db
    .prepare(
      `SELECT DISTINCT item_id AS id FROM item_events WHERE seq > ?`,
    )
    .all(afterSeq) as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

/** Most recent events for an item, returned oldest-first. */
export function listRecentItemEvents(
  db: RelayDb,
  itemId: string,
  limit = 20,
): ItemEvent[] {
  const rows = db
    .prepare(
      `SELECT id, seq, item_id, type, actor_kind, actor_id, payload, created_at
       FROM item_events
       WHERE item_id = ?
       ORDER BY seq DESC
       LIMIT ?`,
    )
    .all(itemId, limit) as EventRow[];
  return rows.map(rowToEvent).reverse();
}
