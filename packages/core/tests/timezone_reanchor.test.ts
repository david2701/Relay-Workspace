import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  dateOnlyZoneIso,
  isDateOnlyInZone,
  toZoneParts,
} from "../src/domain/zone_time.js";
import { RelayService, USER_ACTOR_ID } from "../src/index.js";

const dirs: string[] = [];

function openSvc(): RelayService {
  const dir = mkdtempSync(join(tmpdir(), "relay-tz-"));
  dirs.push(dir);
  return new RelayService({ dbPath: join(dir, "t.db") });
}

afterEach(() => {
  // temp dirs left for OS cleanup; services closed per test
});

describe("PR2 date-only re-anchor on timezone change", () => {
  it("moves 23:59 Paris today to 23:59 New York same calendar day", () => {
    const svc = openSvc();
    const user = { type: "user" as const, id: USER_ACTOR_ID };
    svc.updateSettings({ timezone: "Europe/Paris" });
    const parts = toZoneParts(new Date(), "Europe/Paris");
    const dueParis = dateOnlyZoneIso(parts.y, parts.m, parts.d, "Europe/Paris");
    const item = svc.createItem(
      { title: "Today no-time Paris", due_at: dueParis },
      user,
      "ui",
    );
    expect(isDateOnlyInZone(item.due_at!, "Europe/Paris")).toBe(true);

    svc.updateSettings({ timezone: "America/New_York" });
    const after = svc.getItem(item.id);
    expect(after.due_at).toBeTruthy();
    expect(isDateOnlyInZone(after.due_at!, "America/New_York")).toBe(true);
    const ny = toZoneParts(new Date(after.due_at!), "America/New_York");
    expect(ny.y).toBe(parts.y);
    expect(ny.m).toBe(parts.m);
    expect(ny.d).toBe(parts.d);
    expect(ny.hh).toBe(23);
    expect(ny.mm).toBe(59);

    svc.updateSettings({ timezone: "Europe/Paris" });
    const back = svc.getItem(item.id);
    expect(isDateOnlyInZone(back.due_at!, "Europe/Paris")).toBe(true);
    const p2 = toZoneParts(new Date(back.due_at!), "Europe/Paris");
    expect(p2.y).toBe(parts.y);
    expect(p2.m).toBe(parts.m);
    expect(p2.d).toBe(parts.d);
    svc.close();
  });

  it("leaves timed dues and reminders untouched; skips cancelled", () => {
    const svc = openSvc();
    const user = { type: "user" as const, id: USER_ACTOR_ID };
    svc.updateSettings({ timezone: "Europe/Paris" });
    const timed = "2026-10-08T14:30:00.000Z";
    const reminder = "2026-10-08T12:00:00.000Z";
    const parts = toZoneParts(new Date(), "Europe/Paris");
    const dateOnly = dateOnlyZoneIso(parts.y, parts.m, parts.d, "Europe/Paris");

    const withTime = svc.createItem(
      { title: "Timed", due_at: timed, reminder_at: reminder },
      user,
      "ui",
    );
    const cancelled = svc.createItem(
      { title: "Cancelled date-only", due_at: dateOnly },
      user,
      "ui",
    );
    svc.setStatus(cancelled.id, { status: "cancelled" }, user, "ui");

    svc.updateSettings({ timezone: "America/New_York" });
    const timedAfter = svc.getItem(withTime.id);
    expect(timedAfter.due_at).toBe(timed);
    expect(timedAfter.reminder_at).toBe(reminder);
    const cancelledAfter = svc.getItem(cancelled.id);
    expect(cancelledAfter.due_at).toBe(dateOnly);
    svc.close();
  });
});
