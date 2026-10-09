import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_ACTIVE_MINUTES,
  countAssignedByStatus,
  isAgentActive,
  selectCurrentItems,
} from "../src/domain/agent_presence.js";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";

describe("agent summary / presence", () => {
  let dir: string;
  let svc: RelayService;
  const user = { type: "user" as const, id: USER_ACTOR_ID };
  const code = { type: "agent" as const, id: "agent-code" };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-agent-sum-"));
    svc = new RelayService({ dbPath: join(dir, "relay.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("counts match a fixture of assigned statuses", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    const needs = svc.createItem({ title: "Needs" }, user, "ui");
    svc.delegate(needs.id, "agent-code", user, "ui");
    svc.askUser(needs.id, "Which title should we ship?", code, "mcp");
    const blocked = svc.createItem({ title: "Blocked" }, user, "ui");
    svc.delegate(blocked.id, "agent-code", user, "ui");
    svc.setStatus(
      blocked.id,
      { status: "blocked", blocked_reason: "Waiting on schema" },
      code,
      "mcp",
    );
    const progress = svc.createItem({ title: "Progress" }, user, "ui");
    svc.delegate(progress.id, "agent-code", user, "ui");
    svc.setStatus(progress.id, { status: "in_progress" }, code, "mcp");
    const assigned = svc.createItem({ title: "Assigned only" }, user, "ui");
    svc.delegate(assigned.id, "agent-code", user, "ui");
    const doneRecent = svc.createItem({ title: "Done recent" }, user, "ui");
    svc.delegate(doneRecent.id, "agent-code", user, "ui");
    svc.complete(doneRecent.id, code, "mcp");
    const doneOld = svc.createItem({ title: "Done old" }, user, "ui");
    svc.delegate(doneOld.id, "agent-code", user, "ui");
    const completed = svc.complete(doneOld.id, code, "mcp");
    svc.db
      .prepare("UPDATE work_items SET completed_at = ? WHERE id = ?")
      .run("2026-09-01T00:00:00.000Z", completed.id);
    const other = svc.createItem({ title: "Other agent" }, user, "ui");
    svc.delegate(other.id, "agent-writing", user, "ui");
    const counts = countAssignedByStatus(svc.listItems(), "agent-code", now);
    expect(counts).toEqual({
      needs_you: 1,
      blocked: 1,
      in_progress: 1,
      assigned: 1,
      done: 1,
    });
    const summaries = svc.listAgentSummaries(now);
    const codeSummary = summaries.find((a) => a.id === "agent-code");
    expect(codeSummary?.counts).toEqual(counts);
  });

  it("last_seen_at and active update after an agent action", () => {
    const item = svc.createItem({ title: "Presence" }, user, "ui");
    svc.delegate(item.id, "agent-code", user, "ui");
    const before = svc.listAgentSummaries();
    const beforeCode = before.find((a) => a.id === "agent-code");
    expect(beforeCode?.last_seen_at).toBeNull();
    expect(beforeCode?.active).toBe(false);
    const acted = svc.setStatus(item.id, { status: "in_progress" }, code, "mcp");
    const after = svc.listAgentSummaries(new Date(acted.updated_at));
    const afterCode = after.find((a) => a.id === "agent-code");
    expect(afterCode?.last_seen_at).toBe(acted.updated_at);
    expect(afterCode?.active).toBe(true);
    const staleNow = new Date(
      Date.parse(acted.updated_at) + (AGENT_ACTIVE_MINUTES + 1) * 60_000,
    );
    expect(isAgentActive(acted.updated_at, staleNow)).toBe(false);
    expect(svc.listAgentSummaries(staleNow).find((a) => a.id === "agent-code")?.active).toBe(
      false,
    );
  });

  it("current_items prefer needs_you then blocked", () => {
    const assigned = svc.createItem({ title: "A" }, user, "ui");
    svc.delegate(assigned.id, "agent-code", user, "ui");
    const blocked = svc.createItem({ title: "B" }, user, "ui");
    svc.delegate(blocked.id, "agent-code", user, "ui");
    svc.setStatus(
      blocked.id,
      { status: "blocked", blocked_reason: "Need dump access" },
      code,
      "mcp",
    );
    const needs = svc.createItem({ title: "N" }, user, "ui");
    svc.delegate(needs.id, "agent-code", user, "ui");
    svc.askUser(needs.id, "Pick A or B for the headline?", code, "mcp");
    const ordered = selectCurrentItems(svc.listItems(), "agent-code", 10);
    expect(ordered.map((i) => i.title)).toEqual(["N", "B", "A"]);
    const profile = svc.getAgentProfile("agent-code");
    expect(profile.current_items.map((i) => i.title)).toEqual(["N", "B", "A"]);
  });

  it("handoffs page with before_seq and include item_title", () => {
    const a = svc.createItem({ title: "Alpha handoff" }, user, "ui");
    const b = svc.createItem({ title: "Beta handoff" }, user, "ui");
    const c = svc.createItem({ title: "Gamma handoff" }, user, "ui");
    svc.delegate(a.id, "agent-code", user, "ui");
    svc.delegate(b.id, "agent-code", user, "ui");
    svc.delegate(c.id, "agent-code", user, "ui");
    const page1 = svc.listAgentHandoffsPage("agent-code", { limit: 2 });
    expect(page1.handoffs).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.handoffs[0]?.seq).toBeGreaterThan(page1.handoffs[1]?.seq ?? 0);
    expect(page1.handoffs.every((h) => h.type === "delegated")).toBe(true);
    expect(page1.handoffs.map((h) => h.item_title)).toEqual([
      "Gamma handoff",
      "Beta handoff",
    ]);
    const page2 = svc.listAgentHandoffsPage("agent-code", {
      before_seq: page1.next_seq,
      limit: 2,
    });
    expect(page2.handoffs).toHaveLength(1);
    expect(page2.handoffs[0]?.item_title).toBe("Alpha handoff");
    expect(page2.has_more).toBe(false);
  });

  it("profile handoffs are a flat array with handoffs_next_seq / handoffs_has_more", () => {
    const item = svc.createItem({ title: "Flat shape" }, user, "ui");
    svc.delegate(item.id, "agent-code", user, "ui");
    const profile = svc.getAgentProfile("agent-code", { limit: 10 });
    expect(Array.isArray(profile.handoffs)).toBe(true);
    expect(profile.handoffs.length).toBeGreaterThan(0);
    expect(profile.handoffs_next_seq).toBe(
      profile.handoffs[profile.handoffs.length - 1]?.seq,
    );
    expect(profile.handoffs_has_more).toBe(false);
    const keys = Object.keys(profile);
    expect(keys).toContain("handoffs_next_seq");
    expect(keys).toContain("handoffs_has_more");
    expect(keys).not.toContain("next_seq");
    expect(keys).not.toContain("has_more");
  });

  it("handoffs include agent status_changed to done/cancelled/needs_you/blocked; exclude user updates", () => {
    const done = svc.createItem({ title: "Ship changelog" }, user, "ui");
    svc.delegate(done.id, "agent-code", user, "ui");
    svc.complete(done.id, code, "mcp");
    const cancelled = svc.createItem({ title: "Drop spike" }, user, "ui");
    svc.delegate(cancelled.id, "agent-code", user, "ui");
    svc.setStatus(cancelled.id, { status: "cancelled" }, code, "mcp");
    const needs = svc.createItem({ title: "Pick headline" }, user, "ui");
    svc.delegate(needs.id, "agent-code", user, "ui");
    svc.askUser(needs.id, "Version A or B for the launch post?", code, "mcp");
    const blocked = svc.createItem({ title: "Migrate notes" }, user, "ui");
    svc.delegate(blocked.id, "agent-code", user, "ui");
    svc.setStatus(
      blocked.id,
      { status: "blocked", blocked_reason: "Waiting on dump access" },
      code,
      "mcp",
    );
    const progress = svc.createItem({ title: "Only in progress" }, user, "ui");
    svc.delegate(progress.id, "agent-code", user, "ui");
    svc.setStatus(progress.id, { status: "in_progress" }, code, "mcp");
    const noise = svc.createItem({ title: "User title tweak" }, user, "ui");
    svc.delegate(noise.id, "agent-code", user, "ui");
    svc.updateItem(noise.id, { title: "User title tweak v2" }, user);
    const handoffs = svc.listAgentHandoffsPage("agent-code").handoffs;
    const statusRows = handoffs.filter((h) => h.type === "status_changed");
    const tos = statusRows.map((h) => h.payload.to).sort();
    expect(tos).toEqual(["blocked", "cancelled", "done", "needs_you"]);
    for (const row of statusRows) {
      expect(row.actor_id).toBe("agent-code");
      expect(row.item_title.length).toBeGreaterThan(0);
      expect(row.payload.from).toBeTruthy();
      expect(row.payload.to).toBeTruthy();
    }
    expect(statusRows.some((h) => h.payload.to === "in_progress")).toBe(false);
    expect(handoffs.some((h) => h.type === "updated")).toBe(false);
    const noiseHandoffs = handoffs.filter((h) => h.item_id === noise.id);
    expect(noiseHandoffs).toHaveLength(1);
    expect(noiseHandoffs[0]?.type).toBe("delegated");
    const doneRow = statusRows.find((h) => h.payload.to === "done");
    expect(doneRow?.item_title).toBe("Ship changelog");
  });

  it("getAgentProfile throws not_found for unknown agent", () => {
    expect(() => svc.getAgentProfile("agent-missing")).toThrow(/Agent not found/);
  });
});
