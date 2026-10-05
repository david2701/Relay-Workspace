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
];
