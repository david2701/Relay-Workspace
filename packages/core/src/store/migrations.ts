export const MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  monogram TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL,
  assignee_type TEXT NOT NULL,
  assignee_id TEXT,
  due_at TEXT,
  reminder_at TEXT,
  reminder_intent TEXT,
  priority TEXT NOT NULL,
  blocked_reason TEXT,
  needs_you_reason TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  completed_by_type TEXT,
  completed_by_id TEXT,
  last_actor_type TEXT NOT NULL,
  last_actor_id TEXT NOT NULL,
  list_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_updated ON work_items(updated_at);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_note_links (
  item_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (item_id, note_id),
  FOREIGN KEY (item_id) REFERENCES work_items(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
`,
  },
  {
    version: 2,
    sql: `
CREATE INDEX IF NOT EXISTS idx_work_items_status_updated
  ON work_items(status, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_work_items_assignee_status
  ON work_items(assignee_type, assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_work_items_due ON work_items(due_at);
CREATE INDEX IF NOT EXISTS idx_work_items_reminder ON work_items(reminder_at);
CREATE INDEX IF NOT EXISTS idx_work_items_completed ON work_items(completed_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_item_note_links_note ON item_note_links(note_id);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  entity_id UNINDEXED,
  entity_type UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_work_items_ai AFTER INSERT ON work_items BEGIN
  INSERT INTO search_fts(entity_id, entity_type, title, body)
  VALUES (
    new.id,
    'item',
    new.title,
    trim(
      coalesce(new.goal, '') || char(10) ||
      coalesce(new.blocked_reason, '') || char(10) ||
      coalesce(new.needs_you_reason, '') || char(10) ||
      coalesce(new.reminder_intent, '')
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_work_items_au AFTER UPDATE ON work_items BEGIN
  DELETE FROM search_fts WHERE entity_id = old.id AND entity_type = 'item';
  INSERT INTO search_fts(entity_id, entity_type, title, body)
  VALUES (
    new.id,
    'item',
    new.title,
    trim(
      coalesce(new.goal, '') || char(10) ||
      coalesce(new.blocked_reason, '') || char(10) ||
      coalesce(new.needs_you_reason, '') || char(10) ||
      coalesce(new.reminder_intent, '')
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_work_items_ad AFTER DELETE ON work_items BEGIN
  DELETE FROM search_fts WHERE entity_id = old.id AND entity_type = 'item';
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO search_fts(entity_id, entity_type, title, body)
  VALUES (new.id, 'note', new.title, new.body_md);
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_au AFTER UPDATE ON notes BEGIN
  DELETE FROM search_fts WHERE entity_id = old.id AND entity_type = 'note';
  INSERT INTO search_fts(entity_id, entity_type, title, body)
  VALUES (new.id, 'note', new.title, new.body_md);
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_ad AFTER DELETE ON notes BEGIN
  DELETE FROM search_fts WHERE entity_id = old.id AND entity_type = 'note';
END;
`,
  },
  {
    version: 3,
    sql: `
-- Shared sync watermark for multi-process readers (HTTP + mcp:stdio + SQL).
CREATE TABLE IF NOT EXISTS relay_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO relay_meta(key, value)
  VALUES ('sync_cursor', '1970-01-01T00:00:00.000Z');

CREATE TRIGGER IF NOT EXISTS trg_work_items_sync_ai
AFTER INSERT ON work_items BEGIN
  UPDATE relay_meta
    SET value = new.updated_at
    WHERE key = 'sync_cursor' AND new.updated_at > value;
END;
CREATE TRIGGER IF NOT EXISTS trg_work_items_sync_au
AFTER UPDATE ON work_items BEGIN
  UPDATE relay_meta
    SET value = new.updated_at
    WHERE key = 'sync_cursor' AND new.updated_at > value;
END;
CREATE TRIGGER IF NOT EXISTS trg_notes_sync_ai
AFTER INSERT ON notes BEGIN
  UPDATE relay_meta
    SET value = new.updated_at
    WHERE key = 'sync_cursor' AND new.updated_at > value;
END;
CREATE TRIGGER IF NOT EXISTS trg_notes_sync_au
AFTER UPDATE ON notes BEGIN
  UPDATE relay_meta
    SET value = new.updated_at
    WHERE key = 'sync_cursor' AND new.updated_at > value;
END;
`,
  },
  {
    version: 4,
    sql: `
-- Human actor id: david → user (legacy alias kept in API/MCP/URL layer).
UPDATE work_items SET assignee_id = 'user'
  WHERE assignee_type = 'user' AND assignee_id = 'david';
UPDATE work_items SET last_actor_id = 'user'
  WHERE last_actor_type = 'user' AND last_actor_id = 'david';
UPDATE work_items SET completed_by_id = 'user'
  WHERE completed_by_type = 'user' AND completed_by_id = 'david';

-- App settings (timezone + human display). Locale preference stays client-side.
INSERT OR IGNORE INTO relay_meta(key, value) VALUES ('timezone', 'UTC');
INSERT OR IGNORE INTO relay_meta(key, value) VALUES ('user_display_name', 'You');
INSERT OR IGNORE INTO relay_meta(key, value) VALUES ('user_initial', 'Y');
`,
  },
];
