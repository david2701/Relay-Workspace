import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID, ValidationError } from "@relay/core";
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

  it("GET /api/agents/:id returns flat handoffs profile; unknown id is 404", async () => {
    seedIntoService(svc, "en", { applyDemoProfile: true });
    const res = await app.request("http://127.0.0.1/api/agents/agent-code");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent: {
        id: string;
        current_items: Array<{ id: string; title: string; status: string }>;
        handoffs: Array<{ item_title: string; type: string; seq: number }>;
        handoffs_next_seq: number;
        handoffs_has_more: boolean;
      };
    };
    expect(body.agent.id).toBe("agent-code");
    expect(body.agent.current_items.length).toBeGreaterThan(0);
    expect(Array.isArray(body.agent.handoffs)).toBe(true);
    expect(body.agent.handoffs.length).toBeGreaterThan(0);
    expect(body.agent.handoffs[0]?.item_title.length).toBeGreaterThan(0);
    expect(typeof body.agent.handoffs_next_seq).toBe("number");
    expect(typeof body.agent.handoffs_has_more).toBe("boolean");
    expect(
      (body.agent as unknown as { handoffs?: { handoffs?: unknown } }).handoffs &&
        !Array.isArray(body.agent.handoffs),
    ).toBeFalsy();

    const missing = await app.request("http://127.0.0.1/api/agents/agent-nope");
    expect(missing.status).toBe(404);
    const missingBody = (await missing.json()) as {
      error: string;
      message: string;
    };
    expect(missingBody.error).toBe("not_found");
    expect(missingBody.message).toMatch(/Agent not found/i);
  });

  it("unknown agent is 404 not_found over HTTP and MCP invoke", async () => {
    const http = await app.request("http://127.0.0.1/api/agents/agent-missing");
    expect(http.status).toBe(404);
    const httpBody = (await http.json()) as { error: string; message: string };
    expect(httpBody.error).toBe("not_found");

    await expect(
      invokeMcpTool(svc, "agents_get", { id: "agent-missing" }),
    ).rejects.toMatchObject({ code: "not_found", name: "NotFoundError" });

    const mcpInvoke = await app.request("http://127.0.0.1/mcp/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "agents_get",
        arguments: { id: "agent-missing" },
      }),
    });
    expect(mcpInvoke.status).toBe(404);
    const mcpBody = (await mcpInvoke.json()) as {
      error: string;
      message: string;
    };
    expect(mcpBody.error).toBe("not_found");
    expect(mcpBody.message).toMatch(/Agent not found/i);
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
        handoffs: Array<{ seq: number }>;
        handoffs_next_seq: number;
        handoffs_has_more: boolean;
      };
    };
    expect(page1.agent.handoffs).toHaveLength(2);
    expect(page1.agent.handoffs_has_more).toBe(true);
    const page2 = await (
      await app.request(
        `http://127.0.0.1/api/agents/agent-code?limit=2&before_seq=${page1.agent.handoffs_next_seq}`,
      )
    ).json() as {
      agent: {
        handoffs: Array<{ seq: number }>;
        handoffs_has_more: boolean;
      };
    };
    expect(page2.agent.handoffs).toHaveLength(1);
    expect(page2.agent.handoffs_has_more).toBe(false);
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

  it("handoffs_next_seq echoes request cursor when the page is empty", async () => {
    const res = await app.request(
      "http://127.0.0.1/api/agents/agent-code?after_seq=999&limit=10",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent: { handoffs: unknown[]; handoffs_next_seq: number };
    };
    expect(body.agent.handoffs).toEqual([]);
    expect(body.agent.handoffs_next_seq).toBe(999);
  });

  const badCases: Array<{ query: string; label: string }> = [
    { query: "after_seq=-1", label: "after_seq=-1" },
    { query: "after_seq=abc", label: "after_seq=abc" },
    { query: "before_seq=-1", label: "before_seq=-1" },
    { query: "before_seq=abc", label: "before_seq=abc" },
    { query: "limit=0", label: "limit=0" },
    { query: "limit=-1", label: "limit=-1" },
    { query: "limit=99999", label: "limit=99999" },
    {
      query: "after_seq=999999999999999999999",
      label: "after_seq=huge",
    },
    {
      query: "before_seq=999999999999999999999",
      label: "before_seq=huge",
    },
  ];

  for (const { query, label } of badCases) {
    it(`GET /api/agents/:id returns 400 for ${label}`, async () => {
      const res = await app.request(
        `http://127.0.0.1/api/agents/agent-code?${query}`,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("validation_error");
      expect(typeof body.message).toBe("string");
      expect(body.message.length).toBeGreaterThan(0);
    });
  }

  const mcpBad: Array<{ args: Record<string, unknown>; label: string }> = [
    { args: { after_seq: -1 }, label: "after_seq=-1" },
    { args: { after_seq: "abc" }, label: "after_seq=abc" },
    { args: { before_seq: -1 }, label: "before_seq=-1" },
    { args: { limit: 0 }, label: "limit=0" },
    { args: { limit: -1 }, label: "limit=-1" },
    { args: { limit: 99999 }, label: "limit=99999" },
    {
      args: { after_seq: Number.MAX_SAFE_INTEGER + 1 },
      label: "after_seq=huge",
    },
  ];

  for (const { args, label } of mcpBad) {
    it(`MCP agents_get rejects ${label}`, async () => {
      await expect(
        invokeMcpTool(svc, "agents_get", { id: "agent-code", ...args }),
      ).rejects.toThrow(ValidationError);
    });
  }
});
