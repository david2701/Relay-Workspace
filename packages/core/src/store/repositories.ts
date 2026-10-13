import {
  decodeCursor,
  encodeCursor,
  parseSinceCursor,
} from "../domain/cursor.js";
import type { PageMeta, PageParams } from "../domain/page.js";
import type { Agent } from "../schemas/agent.js";
import type { ItemNoteLink, Note } from "../schemas/note.js";
import type { WorkItem } from "../schemas/work_item.js";
import type { RelayDb } from "./db.js";
import {
  rebuildSearchFts,
  removeFromFts,
  syncItemToFts,
  syncNoteToFts,
} from "./search_index.js";

type ItemRow = {
  id: string;
  title: string;
  goal: string | null;
  status: string;
  assignee_type: string;
  assignee_id: string | null;
  due_at: string | null;
  reminder_at: string | null;
  reminder_intent: string | null;
  priority: string;
  blocked_reason: string | null;
  needs_you_reason: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by_type: string | null;
  completed_by_id: string | null;
  last_actor_type: string;
  last_actor_id: string;
  list_id: string | null;
};

function rowToItem(row: ItemRow): WorkItem {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    status: row.status as WorkItem["status"],
    assignee_type: row.assignee_type as WorkItem["assignee_type"],
    assignee_id: row.assignee_id,
    due_at: row.due_at,
    reminder_at: row.reminder_at,
    reminder_intent: row.reminder_intent,
    priority: row.priority as WorkItem["priority"],
    blocked_reason: row.blocked_reason,
    needs_you_reason: row.needs_you_reason,
    source: row.source as WorkItem["source"],
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    completed_by_type: row.completed_by_type as WorkItem["completed_by_type"],
    completed_by_id: row.completed_by_id,
    last_actor_type: row.last_actor_type as WorkItem["last_actor_type"],
    last_actor_id: row.last_actor_id,
    list_id: row.list_id,
  };
}

export type ListPageResult<T> = {
  items: T[];
  meta: PageMeta;
};

export class WorkItemRepository {
  constructor(private readonly db: RelayDb) {}

  listAll(): WorkItem[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM work_items ORDER BY updated_at DESC, id DESC",
      )
      .all() as ItemRow[];
    return rows.map(rowToItem);
  }

  /** Open (non-terminal) items only — Todo first paint avoids loading done/cancelled. */
  listOpen(): WorkItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM work_items
         WHERE status NOT IN ('done', 'cancelled')
         ORDER BY updated_at DESC, id DESC`,
      )
      .all() as ItemRow[];
    return rows.map(rowToItem);
  }

  listPage(params: PageParams = {}): ListPageResult<WorkItem> {
    const totalRow = this.db
      .prepare("SELECT COUNT(*) AS n FROM work_items")
      .get() as { n: number };
    const total_count = totalRow.n;
    if (params.limit === undefined) {
      const items = this.listAll();
      return {
        items,
        meta: { next_cursor: null, has_more: false, total_count },
      };
    }
    const limit = params.limit;
    let rows: ItemRow[];
    if (params.cursor) {
      const cursor = decodeCursor(params.cursor);
      if (!cursor) {
        rows = this.db
          .prepare(
            `SELECT * FROM work_items
             ORDER BY updated_at DESC, id DESC
             LIMIT ?`,
          )
          .all(limit + 1) as ItemRow[];
      } else {
        rows = this.db
          .prepare(
            `SELECT * FROM work_items
             WHERE updated_at < ?
                OR (updated_at = ? AND id < ?)
             ORDER BY updated_at DESC, id DESC
             LIMIT ?`,
          )
          .all(cursor.updated_at, cursor.updated_at, cursor.id, limit + 1) as ItemRow[];
      }
    } else {
      rows = this.db
        .prepare(
          `SELECT * FROM work_items
           ORDER BY updated_at DESC, id DESC
           LIMIT ?`,
        )
        .all(limit + 1) as ItemRow[];
    }
    const has_more = rows.length > limit;
    const page = has_more ? rows.slice(0, limit) : rows;
    const items = page.map(rowToItem);
    const last = items[items.length - 1];
    const next_cursor =
      has_more && last
        ? encodeCursor({ id: last.id, updated_at: last.updated_at })
        : null;
    return { items, meta: { next_cursor, has_more, total_count } };
  }

  /**
   * Rows with `(updated_at, id)` strictly after `since`.
   * `since` may be a legacy ISO string or a composite cursor (see parseSinceCursor).
   */
  listUpdatedSince(
    since: string,
    params: PageParams = {},
  ): ListPageResult<WorkItem> {
    const cursor = parseSinceCursor(since);
    const allRows = this.db
      .prepare(
        `SELECT * FROM work_items
         WHERE updated_at > ?
            OR (updated_at = ? AND id > ?)
         ORDER BY updated_at ASC, id ASC`,
      )
      .all(cursor.updated_at, cursor.updated_at, cursor.id) as ItemRow[];
    const total_count = allRows.length;
    if (params.limit === undefined) {
      return {
        items: allRows.map(rowToItem),
        meta: { next_cursor: null, has_more: false, total_count },
      };
    }
    const limit = params.limit;
    const has_more = allRows.length > limit;
    const page = has_more ? allRows.slice(0, limit) : allRows;
    const items = page.map(rowToItem);
    const last = items[items.length - 1];
    const next_cursor =
      has_more && last
        ? encodeCursor({ id: last.id, updated_at: last.updated_at })
        : null;
    return { items, meta: { next_cursor, has_more, total_count } };
  }

  maxUpdatedAt(): string | null {
    const row = this.db
      .prepare("SELECT MAX(updated_at) AS m FROM work_items")
      .get() as { m: string | null };
    return row.m;
  }

  countNeedsYou(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM work_items WHERE status = 'needs_you'")
      .get() as { n: number };
    return row.n;
  }

  get(id: string): WorkItem | null {
    const row = this.db
      .prepare("SELECT * FROM work_items WHERE id = ?")
      .get(id) as ItemRow | undefined;
    return row ? rowToItem(row) : null;
  }

  upsert(item: WorkItem): void {
    this.db
      .prepare(
        `INSERT INTO work_items (
          id, title, goal, status, assignee_type, assignee_id,
          due_at, reminder_at, reminder_intent, priority,
          blocked_reason, needs_you_reason, source,
          created_at, updated_at, started_at, completed_at,
          completed_by_type, completed_by_id, last_actor_type, last_actor_id, list_id
        ) VALUES (
          @id, @title, @goal, @status, @assignee_type, @assignee_id,
          @due_at, @reminder_at, @reminder_intent, @priority,
          @blocked_reason, @needs_you_reason, @source,
          @created_at, @updated_at, @started_at, @completed_at,
          @completed_by_type, @completed_by_id, @last_actor_type, @last_actor_id, @list_id
        )
        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title, goal=excluded.goal, status=excluded.status,
          assignee_type=excluded.assignee_type, assignee_id=excluded.assignee_id,
          due_at=excluded.due_at, reminder_at=excluded.reminder_at,
          reminder_intent=excluded.reminder_intent, priority=excluded.priority,
          blocked_reason=excluded.blocked_reason, needs_you_reason=excluded.needs_you_reason,
          source=excluded.source, updated_at=excluded.updated_at,
          started_at=excluded.started_at, completed_at=excluded.completed_at,
          completed_by_type=excluded.completed_by_type, completed_by_id=excluded.completed_by_id,
          last_actor_type=excluded.last_actor_type, last_actor_id=excluded.last_actor_id,
          list_id=excluded.list_id`,
      )
      .run(item);
    syncItemToFts(this.db, item);
  }

  /**
   * Update item only when current updated_at matches expected.
   * Returns false on conflict (row missing or stamp mismatch).
   */
  updateIfUnchanged(item: WorkItem, expectedUpdatedAt: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE work_items SET
          title = @title, goal = @goal, status = @status,
          assignee_type = @assignee_type, assignee_id = @assignee_id,
          due_at = @due_at, reminder_at = @reminder_at,
          reminder_intent = @reminder_intent, priority = @priority,
          blocked_reason = @blocked_reason, needs_you_reason = @needs_you_reason,
          source = @source, updated_at = @updated_at,
          started_at = @started_at, completed_at = @completed_at,
          completed_by_type = @completed_by_type, completed_by_id = @completed_by_id,
          last_actor_type = @last_actor_type, last_actor_id = @last_actor_id,
          list_id = @list_id
         WHERE id = @id AND updated_at = @expected`,
      )
      .run({
        id: item.id,
        title: item.title,
        goal: item.goal,
        status: item.status,
        assignee_type: item.assignee_type,
        assignee_id: item.assignee_id,
        due_at: item.due_at,
        reminder_at: item.reminder_at,
        reminder_intent: item.reminder_intent,
        priority: item.priority,
        blocked_reason: item.blocked_reason,
        needs_you_reason: item.needs_you_reason,
        source: item.source,
        updated_at: item.updated_at,
        started_at: item.started_at,
        completed_at: item.completed_at,
        completed_by_type: item.completed_by_type,
        completed_by_id: item.completed_by_id,
        last_actor_type: item.last_actor_type,
        last_actor_id: item.last_actor_id,
        list_id: item.list_id,
        expected: expectedUpdatedAt,
      });
    if (result.changes === 0) return false;
    syncItemToFts(this.db, item);
    return true;
  }

  rebuildFts(): void {
    rebuildSearchFts(this.db);
  }

  reindexItem(item: WorkItem): void {
    syncItemToFts(this.db, item);
  }

  deleteAll(): void {
    this.db.exec("DELETE FROM item_note_links");
    this.db.exec("DELETE FROM work_items");
    this.db.exec("DELETE FROM search_fts WHERE entity_type = 'item'");
  }
}

export class NoteRepository {
  constructor(private readonly db: RelayDb) {}

  listAll(): Note[] {
    return this.db
      .prepare("SELECT * FROM notes ORDER BY updated_at DESC, id DESC")
      .all() as Note[];
  }

  listPage(params: PageParams = {}): ListPageResult<Note> {
    const totalRow = this.db
      .prepare("SELECT COUNT(*) AS n FROM notes")
      .get() as { n: number };
    const total_count = totalRow.n;
    if (params.limit === undefined) {
      const items = this.listAll();
      return {
        items,
        meta: { next_cursor: null, has_more: false, total_count },
      };
    }
    const limit = params.limit;
    let rows: Note[];
    if (params.cursor) {
      const cursor = decodeCursor(params.cursor);
      if (!cursor) {
        rows = this.db
          .prepare(
            `SELECT * FROM notes
             ORDER BY updated_at DESC, id DESC
             LIMIT ?`,
          )
          .all(limit + 1) as Note[];
      } else {
        rows = this.db
          .prepare(
            `SELECT * FROM notes
             WHERE updated_at < ?
                OR (updated_at = ? AND id < ?)
             ORDER BY updated_at DESC, id DESC
             LIMIT ?`,
          )
          .all(cursor.updated_at, cursor.updated_at, cursor.id, limit + 1) as Note[];
      }
    } else {
      rows = this.db
        .prepare(
          `SELECT * FROM notes
           ORDER BY updated_at DESC, id DESC
           LIMIT ?`,
        )
        .all(limit + 1) as Note[];
    }
    const has_more = rows.length > limit;
    const items = has_more ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const next_cursor =
      has_more && last
        ? encodeCursor({ id: last.id, updated_at: last.updated_at })
        : null;
    return { items, meta: { next_cursor, has_more, total_count } };
  }

  /**
   * Notes with `(updated_at, id)` strictly after `since`.
   * `since` may be a legacy ISO string or a composite cursor (see parseSinceCursor).
   */
  listUpdatedSince(
    since: string,
    params: PageParams = {},
  ): ListPageResult<Note> {
    const cursor = parseSinceCursor(since);
    const allRows = this.db
      .prepare(
        `SELECT * FROM notes
         WHERE updated_at > ?
            OR (updated_at = ? AND id > ?)
         ORDER BY updated_at ASC, id ASC`,
      )
      .all(cursor.updated_at, cursor.updated_at, cursor.id) as Note[];
    const total_count = allRows.length;
    if (params.limit === undefined) {
      return {
        items: allRows,
        meta: { next_cursor: null, has_more: false, total_count },
      };
    }
    const limit = params.limit;
    const has_more = allRows.length > limit;
    const items = has_more ? allRows.slice(0, limit) : allRows;
    const last = items[items.length - 1];
    const next_cursor =
      has_more && last
        ? encodeCursor({ id: last.id, updated_at: last.updated_at })
        : null;
    return { items, meta: { next_cursor, has_more, total_count } };
  }

  get(id: string): Note | null {
    const row = this.db
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(id) as Note | undefined;
    return row ?? null;
  }

  upsert(note: Note): void {
    this.db
      .prepare(
        `INSERT INTO notes (id, title, body_md, created_at, updated_at)
         VALUES (@id, @title, @body_md, @created_at, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, body_md=excluded.body_md, updated_at=excluded.updated_at`,
      )
      .run(note);
    syncNoteToFts(this.db, note);
  }

  /**
   * Update note only when current updated_at matches expected.
   * Returns false on conflict (row missing or stamp mismatch).
   */
  updateIfUnchanged(note: Note, expectedUpdatedAt: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE notes
         SET title = @title, body_md = @body_md, updated_at = @updated_at
         WHERE id = @id AND updated_at = @expected`,
      )
      .run({
        id: note.id,
        title: note.title,
        body_md: note.body_md,
        updated_at: note.updated_at,
        expected: expectedUpdatedAt,
      });
    if (result.changes === 0) return false;
    syncNoteToFts(this.db, note);
    return true;
  }

  reindexNote(note: Note): void {
    syncNoteToFts(this.db, note);
  }

  deleteAll(): void {
    this.db.exec("DELETE FROM item_note_links");
    this.db.exec("DELETE FROM notes");
    this.db.exec("DELETE FROM search_fts WHERE entity_type = 'note'");
  }
}

export class LinkRepository {
  constructor(private readonly db: RelayDb) {}

  listAll(): ItemNoteLink[] {
    return this.db
      .prepare("SELECT item_id, note_id, role FROM item_note_links")
      .all() as ItemNoteLink[];
  }

  listForItem(itemId: string): ItemNoteLink[] {
    return this.db
      .prepare(
        "SELECT item_id, note_id, role FROM item_note_links WHERE item_id = ?",
      )
      .all(itemId) as ItemNoteLink[];
  }

  listForNote(noteId: string): ItemNoteLink[] {
    return this.db
      .prepare(
        "SELECT item_id, note_id, role FROM item_note_links WHERE note_id = ?",
      )
      .all(noteId) as ItemNoteLink[];
  }

  link(link: ItemNoteLink): void {
    this.db
      .prepare(
        `INSERT INTO item_note_links (item_id, note_id, role)
         VALUES (@item_id, @note_id, @role)
         ON CONFLICT(item_id, note_id) DO UPDATE SET role=excluded.role`,
      )
      .run(link);
  }

  unlink(itemId: string, noteId: string): void {
    this.db
      .prepare(
        "DELETE FROM item_note_links WHERE item_id = ? AND note_id = ?",
      )
      .run(itemId, noteId);
  }
}

export class AgentRepository {
  constructor(private readonly db: RelayDb) {}

  list(): Agent[] {
    return this.db
      .prepare("SELECT id, display_name, monogram FROM agents ORDER BY display_name")
      .all() as Agent[];
  }

  get(id: string): Agent | null {
    const row = this.db
      .prepare("SELECT id, display_name, monogram FROM agents WHERE id = ?")
      .get(id) as Agent | undefined;
    return row ?? null;
  }
}

export { rebuildSearchFts, removeFromFts, syncItemToFts, syncNoteToFts };
