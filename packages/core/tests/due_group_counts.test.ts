import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyDue, countDueGroups } from "../src/domain/date_groups.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";

describe("Todo due group_counts (server totals)", () => {
  let dir: string;
  let svc: RelayService;
  const now = new Date("2026-10-08T12:00:00.000Z");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-due-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("paged view=all returns full group_counts; sum equals total_count", () => {
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    // Overdue
    svc.createItem(
      {
        title: "Overdue one",
        due_at: "2026-10-07T10:00:00.000Z",
      },
      actor,
      "ui",
    );
    // Today (Paris afternoon)
    svc.createItem(
      {
        title: "Today one",
        due_at: "2026-10-08T16:00:00.000Z",
      },
      actor,
      "ui",
    );
    // No due (reminder only — must land in Sin fecha)
    const rem = svc.createItem(
      {
        title: "Reminder only",
        reminder_at: "2026-10-09T20:00:00.000Z",
        reminder_intent: "Confirmar disponibilidad",
      },
      actor,
      "ui",
    );
    expect(rem.due_at).toBeNull();

    const page = svc.inboxQuery("all", { limit: 2, now });
    if ("mode" in page) throw new Error("expected snapshot");
    expect(page.items.length).toBe(2);
    expect(page.total_count).toBe(3);
    expect(page.group_counts).toBeTruthy();
    const sum = (page.group_counts ?? []).reduce((n, g) => n + g.count, 0);
    expect(sum).toBe(page.total_count);

    const byKey = new Map((page.group_counts ?? []).map((g) => [g.key, g.count]));
    expect(byKey.get("overdue")).toBe(1);
    expect(byKey.get("today")).toBe(1);
    expect(byKey.get("none")).toBe(1);

    // SQL-equivalent: classify every open item the same way.
    const all = svc.listItems({ limit: 200 }).items.filter(
      (i) => i.status !== "done" && i.status !== "cancelled",
    );
    const sqlish = countDueGroups(all, now, svc.getSettings().timezone);
    expect(sqlish).toEqual(page.group_counts);

    // Items with due_at never classify as none.
    for (const item of all) {
      if (item.due_at) {
        expect(
          classifyDue(item.due_at, item.status, now, svc.getSettings().timezone),
        ).not.toBe("none");
      }
    }
  });
});
