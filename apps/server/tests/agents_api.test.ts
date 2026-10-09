import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { invokeMcpTool } from "../src/mcp/http.js";
import { seedIntoService } from "../src/seed/demo_seed.js";

describe("agents HTTP + MCP", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-agents-api-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/agents stays backward compatible and adds summary fields", async () => {
    seedIntoService(svc, "en", { applyDemoProfile: true });
    const res = await app.request("http://127.0.0.1/api/agents");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agents: Array<{
        id: string;
        display_name: string;
        monogram: string;
        last_seen_at: string | null;
        active: boolean;
        counts: Record<string, number>;
      }>;
    };
    expect(body.agents.length).toBeGreaterThanOrEqual(4);
    for (const agent of body.agents) {
      expect(agent.id).toBeTruthy();
      expect(agent.display_name).toBeTruthy();
      expect(agent.monogram.length).toBeGreaterThan(0);
      expect(agent.monogram.length).toBeLessThanOrEqual(2);
      expect(typeof agent.active).toBe("boolean");
      expect(agent.counts).toMatchObject({
        needs_you: expect.any(Number),
        blocked: expect.any(Number),
        in_progress: expect.any(Number),
        assigned: expect.any(Number),
        done: expect.any(Number),
      });
    }
    const code = body.agents.find((a) => a.id === "agent-code");
    expect(code?.display_name).toBe("Code agent");
    expect(code?.monogram).toBe("CO");
    expect((code?.counts.needs_you ?? 0) + (code?.counts.in_progress ?? 0)).toBeGreaterThan(
      0,
    );
  });

  it("GET /api/agents/:id returns profile; unknown id is 404", async () => {
    seedIntoService(svc, "en", { applyDemoProfile: true });
    const res = await app.request("http://127.0.0.1/api/agents/agent-code");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent: {
        id: string;
        current_items: Array<{ id: string; title: string; status: string }>;
        handoffs: {
          handoffs: Array<{ item_title: string; type: string; seq: number }>;
          next_seq: number;
          has_more: boolean;
        };
      };
    };
    expect(body.agent.id).toBe("agent-code");
    expect(body.agent.current_items.length).toBeGreaterThan(0);
    expect(body.agent.handoffs.handoffs.length).toBeGreaterThan(0);
    expect(body.agent.handoffs.handoffs[0]?.item_title.length).toBeGreaterThan(0);

    const missing = await app.request("http://127.0.0.1/api/agents/agent-nope");
    expect(missing.status).toBe(404);
  });

  it("handoffs paging via before_seq on HTTP", async () => {
    const a = svc.createItem({ title: "One" }, actor, "ui");
    const b = svc.createItem({ title: "Two" }, actor, "ui");
    const c = svc.createItem({ title: "Three" }, actor, "ui");
    svc.delegate(a.id, "agent-code", actor, "ui");
    svc.delegate(b.id, "agent-code", actor, "ui");
    svc.delegate(c.id, "agent-code", actor, "ui");
    const page1 = await (
      await app.request("http://127.0.0.1/api/agents/agent-code?limit=2")
    ).json() as {
      agent: {
        handoffs: { handoffs: Array<{ seq: number }>; next_seq: number; has_more: boolean };
      };
    };
    expect(page1.agent.handoffs.handoffs).toHaveLength(2);
    expect(page1.agent.handoffs.has_more).toBe(true);
    const page2 = await (
      await app.request(
        `http://127.0.0.1/api/agents/agent-code?limit=2&before_seq=${page1.agent.handoffs.next_seq}`,
      )
    ).json() as {
      agent: {
        handoffs: { handoffs: Array<{ seq: number }>; has_more: boolean };
      };
    };
    expect(page2.agent.handoffs.handoffs).toHaveLength(1);
    expect(page2.agent.handoffs.has_more).toBe(false);
  });

  it("MCP agents_list / agents_get match HTTP", async () => {
    seedIntoService(svc, "en", { applyDemoProfile: true });
    const httpList = await (await app.request("http://127.0.0.1/api/agents")).json();
    const mcpList = await invokeMcpTool(svc, "agents_list", {});
    expect(mcpList).toEqual(httpList);

    const httpGet = await (
      await app.request("http://127.0.0.1/api/agents/agent-code?limit=5")
    ).json();
    const mcpGet = await invokeMcpTool(svc, "agents_get", {
      id: "agent-code",
      limit: 5,
    });
    expect(mcpGet).toEqual(httpGet);
  });
});
