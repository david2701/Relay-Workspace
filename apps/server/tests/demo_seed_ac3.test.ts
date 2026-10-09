/**
 * AC3-D2 / AC3-D3 / AC3-D4 / PR1 — demo seed contract.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyDue,
  countDueGroups,
  RelayService,
  USER_ACTOR_ID,
} from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetDemoDatabase,
  seedDemoDatabase,
  seedIntoService,
} from "../src/seed/demo_seed.js";

describe("demo seed AC3-D*", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-demo-seed-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("AC3-D2: seven statuses, needs_you+blocked reasons, reminder intent, agent-done, ≥3 notes", () => {
    const dbPath = join(dir, "demo.db");
    const seeded = seedDemoDatabase(dbPath);
    expect(seeded.onboardingCompletedAt).toBeNull();
    expect(seeded.locale).toBe("en");
    expect(seeded.workItemCount).toBeGreaterThanOrEqual(7);
    expect(seeded.noteCount).toBeGreaterThanOrEqual(3);

    const svc = new RelayService({ dbPath });
    const items = svc.listItems();
    const byStatus = new Map(items.map((i) => [i.status, i]));
    for (const status of [
      "inbox",
      "assigned",
      "in_progress",
      "blocked",
      "needs_you",
      "done",
      "cancelled",
    ] as const) {
      expect(byStatus.has(status), `missing status ${status}`).toBe(true);
    }
    const needsYou = items.find((i) => i.id === seeded.needsYouId);
    expect(needsYou?.status).toBe("needs_you");
    expect(needsYou?.needs_you_reason?.length).toBeGreaterThan(0);
    expect(needsYou?.reminder_intent?.length).toBeGreaterThan(0);
    const blocked = items.find((i) => i.id === seeded.blockedId);
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.blocked_reason?.length).toBeGreaterThan(0);
    const done = items.find((i) => i.status === "done");
    expect(done?.completed_by_type).toBe("agent");
    expect(done?.completed_by_id).toBe("agent-writing");
    const blob = JSON.stringify(items) + JSON.stringify(svc.listNotes());
    expect(blob).not.toMatch(/Grok|Claude|Cursor|Acme|David/i);
    svc.close();
  });

  it("PR1: demo seed leaves onboarding_completed_at null; CLI seed marks it", () => {
    const demoPath = join(dir, "demo.db");
    const cliPath = join(dir, "cli.db");
    const demo = seedDemoDatabase(demoPath);
    expect(demo.onboardingCompletedAt).toBeNull();

    const cli = new RelayService({ dbPath: cliPath });
    seedIntoService(cli, "en", { applyDemoProfile: true });
    expect(cli.getSettings().onboarding_completed_at).not.toBeNull();
    cli.close();
  });

  it("AC3-D3: seeding on another calendar day still fills Today and Tomorrow", () => {
    const dbPath = join(dir, "d3.db");
    const dayA = new Date("2026-03-10T09:00:00.000Z");
    const dayB = new Date("2026-11-22T15:30:00.000Z");
    for (const now of [dayA, dayB]) {
      const svc = new RelayService({ dbPath });
      svc.updateSettings({ timezone: "Europe/Paris" });
      seedIntoService(svc, "en", { applyDemoProfile: false, now });
      const tz = svc.getSettings().timezone;
      const groups = countDueGroups(svc.listItems(), now, tz);
      const today = groups.find((g) => g.key === "today");
      const tomorrow = groups.find((g) => g.key === "tomorrow");
      expect(today?.count ?? 0, `today on ${now.toISOString()}`).toBeGreaterThan(
        0,
      );
      expect(
        tomorrow?.count ?? 0,
        `tomorrow on ${now.toISOString()}`,
      ).toBeGreaterThan(0);
      for (const item of svc.listItems()) {
        if (!item.due_at || item.status === "done" || item.status === "cancelled") {
          continue;
        }
        const key = classifyDue(item.due_at, item.status, now, tz);
        if (item.title.includes("Prepare the product demo")) {
          expect(key).toBe("today");
        }
        if (item.title.includes("Review the hosting")) {
          expect(key).toBe("tomorrow");
        }
      }
      svc.close();
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}-wal`, { force: true });
      rmSync(`${dbPath}-shm`, { force: true });
    }
  });

  it("AC3-D4: reset finishes quickly and leaves another store intact", () => {
    const demoPath = join(dir, "relay-demo.db");
    const otherPath = join(dir, "relay.db");
    seedDemoDatabase(demoPath);
    const other = new RelayService({ dbPath: otherPath });
    other.updateSettings({
      timezone: "America/New_York",
      user_display_name: "Owner",
      user_initial: "O",
      onboarding_completed_at: new Date().toISOString(),
    });
    const own = other.createItem(
      { title: "Private user item — do not touch" },
      { type: "user", id: USER_ACTOR_ID },
      "ui",
    );
    other.close();

    const demoSvc = new RelayService({ dbPath: demoPath });
    demoSvc.updateSettings({
      user_display_name: "Alex",
      user_initial: "A",
      onboarding_completed_at: new Date().toISOString(),
    });
    demoSvc.close();

    const started = Date.now();
    const reset = resetDemoDatabase(demoPath);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThanOrEqual(30_000);
    expect(reset.workItemCount).toBeGreaterThan(0);
    expect(reset.onboardingCompletedAt).not.toBeNull();

    const demoAfter = new RelayService({ dbPath: demoPath });
    expect(demoAfter.getSettings().user_display_name).toBe("Alex");
    expect(demoAfter.getSettings().onboarding_completed_at).not.toBeNull();
    demoAfter.close();

    const otherAfter = new RelayService({ dbPath: otherPath });
    const still = otherAfter.listItems().find((i) => i.id === own.id);
    expect(still?.title).toBe("Private user item — do not touch");
    expect(otherAfter.getSettings().user_display_name).toBe("Owner");
    expect(otherAfter.getSettings().timezone).toBe("America/New_York");
    otherAfter.close();
  });
});
