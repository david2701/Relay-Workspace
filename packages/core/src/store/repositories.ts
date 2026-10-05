import type { Agent } from "../schemas/agent.js";
import type { ItemNoteLink, Note } from "../schemas/note.js";
import type { WorkItem } from "../schemas/work_item.js";
import type { RelayDb } from "./db.js";

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

export class WorkItemRepository {
  constructor(private readonly db: RelayDb) {}

  listAll(): WorkItem[] {
    const rows = this.db
      .prepare("SELECT * FROM work_items ORDER BY updated_at DESC")
      .all() as ItemRow[];
    return rows.map(rowToItem);
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
  }

  deleteAll(): void {
    this.db.exec("DELETE FROM item_note_links");
    this.db.exec("DELETE FROM work_items");
  }
}

export class NoteRepository {
  constructor(private readonly db: RelayDb) {}

  listAll(): Note[] {
    return this.db
      .prepare("SELECT * FROM notes ORDER BY updated_at DESC")
      .all() as Note[];
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
  }

  deleteAll(): void {
    this.db.exec("DELETE FROM item_note_links");
    this.db.exec("DELETE FROM notes");
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
