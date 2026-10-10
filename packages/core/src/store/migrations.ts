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
INSERT OR IGNORE INTO relay_meta(key, value) VALUES ('user_display_name', '');
INSERT OR IGNORE INTO relay_meta(key, value) VALUES ('user_initial', '');
`,
  },
  {
    version: 5,
    sql: `
-- First-run card (§3): null/absent means onboarding has not been completed.
INSERT OR IGNORE INTO relay_meta(key, value) VALUES ('onboarding_completed_at', '');
`,
  },
  {
    version: 6,
    sql: `
-- Global monotonic event log (SSE / mobile sync / handoff history foundation).
CREATE TABLE IF NOT EXISTS item_events (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES work_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_events_item_seq
  ON item_events(item_id, seq);
CREATE INDEX IF NOT EXISTS idx_item_events_seq
  ON item_events(seq);

CREATE TABLE IF NOT EXISTS event_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_seq INTEGER NOT NULL
);
INSERT OR IGNORE INTO event_seq(id, next_seq) VALUES (1, 1);

-- One synthetic created event per existing item (history non-empty after upgrade).
INSERT INTO item_events (id, seq, item_id, type, actor_kind, actor_id, payload, created_at)
SELECT
  printf('evt_bf%08d', ordered.rn),
  ordered.rn,
  ordered.id,
  'created',
  ordered.last_actor_type,
  ordered.last_actor_id,
  json_object(
    'title', ordered.title,
    'status', ordered.status,
    'assignee_type', ordered.assignee_type,
    'assignee_id', ordered.assignee_id,
    'backfill', 1
  ),
  ordered.created_at
FROM (
  SELECT
    id,
    title,
    status,
    assignee_type,
    assignee_id,
    last_actor_type,
    last_actor_id,
    created_at,
    ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM work_items
) AS ordered;

UPDATE event_seq
  SET next_seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM item_events)
  WHERE id = 1;
`,
  },
  {
    version: 7,
    sql: `
-- HTTP Idempotency-Key cache (24h TTL). Key is unique per method+path.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, method, path)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created
  ON idempotency_keys(created_at);
`,
  },
  {
    version: 8,
    sql: `
-- Per-device auth tokens (hash only) + short-lived pairing codes.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_revoked ON devices(revoked_at);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_by_device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires ON pairing_codes(expires_at);

CREATE TABLE IF NOT EXISTS pairing_ip_backoff (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT
);

-- Short-lived SSE EventSource tickets (query param; never the long-lived device token).
CREATE TABLE IF NOT EXISTS stream_tickets (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stream_tickets_expires ON stream_tickets(expires_at);
`,
  },
  {
    version: 9,
    sql: `
-- Push notification registration (APNs / FCM) on the device row.
ALTER TABLE devices ADD COLUMN push_platform TEXT;
ALTER TABLE devices ADD COLUMN push_token TEXT;
ALTER TABLE devices ADD COLUMN push_environment TEXT;
ALTER TABLE devices ADD COLUMN push_topic TEXT;
ALTER TABLE devices ADD COLUMN push_muted INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_devices_push_token
  ON devices(push_token) WHERE push_token IS NOT NULL;
`,
  },
];
