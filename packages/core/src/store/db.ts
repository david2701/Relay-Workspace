import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_AGENTS } from "../schemas/agent.js";
import { cleanupExpiredIdempotencyKeys } from "./idempotency.js";
import { MIGRATIONS } from "./migrations.js";
import { rebuildSearchFts } from "./search_index.js";

export type RelayDb = DatabaseSync;

/** SQLite schema cookie — increments on every commit from any connection. */
export function readSqliteDataVersion(db: RelayDb): number {
  const row = db.prepare("PRAGMA data_version").get() as
    | { data_version?: number }
    | Record<string, number>
    | undefined;
  if (!row) return 0;
  if (typeof row.data_version === "number") return row.data_version;
  const first = Object.values(row)[0];
  return typeof first === "number" ? first : 0;
}

export function openDatabase(dbPath: string): RelayDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // busy_timeout must be set before WAL/migrate — concurrent opens otherwise
  // fail immediately with "database is locked" (CI item_events workers).
  db.exec("PRAGMA busy_timeout = 30000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  seedAgents(db);
  cleanupExpiredIdempotencyKeys(db);
  return db;
}

function migrate(db: RelayDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
    .get() as { v: number };
  const current = row.v;
  let appliedV2 = false;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(m.version, new Date().toISOString());
      db.exec("COMMIT");
      if (m.version === 2) appliedV2 = true;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  if (appliedV2) {
    rebuildSearchFts(db);
  }
}

function seedAgents(db: RelayDb): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agents (id, display_name, monogram) VALUES (?, ?, ?)`,
  );
  for (const agent of DEFAULT_AGENTS) {
    insert.run(agent.id, agent.display_name, agent.monogram);
  }
}

export function closeDatabase(db: RelayDb): void {
  db.close();
}
