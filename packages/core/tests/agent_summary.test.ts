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

  it("getAgentProfile throws not_found for unknown agent", () => {
    expect(() => svc.getAgentProfile("agent-missing")).toThrow(/Agent not found/);
  });
});
