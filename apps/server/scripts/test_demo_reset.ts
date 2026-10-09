/**
 * AC3-D4 runner: reset demo store in ≤ 30 s; leave a sibling store intact.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { resetDemoDatabase, seedDemoDatabase } from "../src/seed/demo_seed.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const artifacts = resolve(root, "artifacts");
mkdirSync(artifacts, { recursive: true });

const dir = mkdtempSync(join(tmpdir(), "relay-d4-"));
const demoDb = join(dir, "relay-demo.db");
const otherDb = join(dir, "relay.db");

try {
  seedDemoDatabase(demoDb);
  const other = new RelayService({ dbPath: otherDb });
  other.updateSettings({
    timezone: "UTC",
    user_display_name: "Keeper",
    user_initial: "K",
    onboarding_completed_at: new Date().toISOString(),
  });
  const item = other.createItem(
    { title: "Sibling store sentinel" },
    { type: "user", id: USER_ACTOR_ID },
    "ui",
  );
  other.close();

  const started = Date.now();
  resetDemoDatabase(demoDb);
  const elapsedMs = Date.now() - started;

  const otherAfter = new RelayService({ dbPath: otherDb });
  const still = otherAfter.listItems().find((i) => i.id === item.id);
  const intact =
    still?.title === "Sibling store sentinel" &&
    otherAfter.getSettings().user_display_name === "Keeper";
  otherAfter.close();

  const report = {
    ok: elapsedMs <= 30_000 && intact,
    elapsedMs,
    elapsedSec: Number((elapsedMs / 1000).toFixed(3)),
    limitMs: 30_000,
    siblingStoreIntact: intact,
    demoDb,
    otherDb,
  };
  writeFileSync(
    resolve(artifacts, "demo-reset-timing.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.info(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
