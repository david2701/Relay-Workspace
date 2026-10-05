import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { invokeMcpTool } from "../src/mcp/http.js";

describe("AC1 web-API vs MCP create parity", () => {
  let dir: string;
  let svc: RelayService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-srv-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    app = createApp(svc, "http://127.0.0.1:7421");
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates identical canonical fields via HTTP UI and MCP tool", async () => {
    const res = await app.request("http://127.0.0.1/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Source": "ui",
      },
      body: JSON.stringify({ title: "Paridad UI" }),
    });
    expect(res.status).toBe(201);
    const uiJson = (await res.json()) as { item: Record<string, unknown> };
    const mcpResult = (await invokeMcpTool(
      svc,
      "items_create",
      {
        title: "Paridad MCP",
        actor: { id: "grok-bot", type: "agent" },
      },
      "grok-bot",
    )) as { item: Record<string, unknown> };

    const uiKeys = Object.keys(uiJson.item).sort();
    const mcpKeys = Object.keys(mcpResult.item).sort();
    expect(mcpKeys).toEqual(uiKeys);
    expect(uiJson.item.status).toBe("inbox");
    expect(uiJson.item.source).toBe("ui");
    expect(uiJson.item.last_actor_id).toBe(USER_ACTOR_ID);
    expect(mcpResult.item.source).toBe("mcp");
    expect(mcpResult.item.last_actor_id).toBe("grok-bot");
    expect(mcpResult.item.last_actor_type).toBe("agent");
  });

  it("binds only local CORS origins", async () => {
    const res = await app.request("http://127.0.0.1/api/health", {
      headers: { Origin: "http://127.0.0.1:7421" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:7421",
    );
    const bad = await app.request("http://127.0.0.1/api/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});
