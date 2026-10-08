import type { Note } from "../schemas/note.js";
import type { WorkItem } from "../schemas/work_item.js";
import type { RelayDb } from "./db.js";

function itemBody(item: WorkItem): string {
  return [item.goal, item.blocked_reason, item.needs_you_reason, item.reminder_intent]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join("\n");
}

export function syncItemToFts(db: RelayDb, item: WorkItem): void {
  db.prepare(
    "DELETE FROM search_fts WHERE entity_id = ? AND entity_type = 'item'",
  ).run(item.id);
  db.prepare(
    `INSERT INTO search_fts(entity_id, entity_type, title, body)
     VALUES (?, 'item', ?, ?)`,
  ).run(item.id, item.title, itemBody(item));
}

export function syncNoteToFts(db: RelayDb, note: Note): void {
  db.prepare(
    "DELETE FROM search_fts WHERE entity_id = ? AND entity_type = 'note'",
  ).run(note.id);
  db.prepare(
    `INSERT INTO search_fts(entity_id, entity_type, title, body)
     VALUES (?, 'note', ?, ?)`,
  ).run(note.id, note.title, note.body_md);
}

export function removeFromFts(
  db: RelayDb,
  entityId: string,
  entityType: "item" | "note",
): void {
  db.prepare(
    "DELETE FROM search_fts WHERE entity_id = ? AND entity_type = ?",
  ).run(entityId, entityType);
}

/** Full rebuild of search_fts from work_items + notes. */
export function rebuildSearchFts(db: RelayDb): void {
  db.exec("DELETE FROM search_fts");
  const items = db
    .prepare(
      `SELECT id, title, goal, blocked_reason, needs_you_reason, reminder_intent
       FROM work_items`,
    )
    .all() as Array<{
    id: string;
    title: string;
    goal: string | null;
    blocked_reason: string | null;
    needs_you_reason: string | null;
    reminder_intent: string | null;
  }>;
  const insert = db.prepare(
    `INSERT INTO search_fts(entity_id, entity_type, title, body)
     VALUES (?, ?, ?, ?)`,
  );
  for (const row of items) {
    const body = [
      row.goal,
      row.blocked_reason,
      row.needs_you_reason,
      row.reminder_intent,
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join("\n");
    insert.run(row.id, "item", row.title, body);
  }
  const notes = db
    .prepare("SELECT id, title, body_md FROM notes")
    .all() as Array<{ id: string; title: string; body_md: string }>;
  for (const note of notes) {
    insert.run(note.id, "note", note.title, note.body_md);
  }
}
