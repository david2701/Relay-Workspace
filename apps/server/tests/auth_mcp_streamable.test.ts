/**
 * Streamable HTTP `/mcp` must use the same token gate as `/api/*`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";

const MCP_METHODS = [
  {
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" },
    },
  },
  { method: "tools/list", params: {} },
  {
    method: "tools/call",
    params: { name: "agents_list", arguments: {} },
  },
] as const;

function mcpBody(
  method: string,
  params: Record<string, unknown>,
  id = 1,
): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

describe("/mcp Streamable HTTP auth", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-mcp-auth-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("REQUIRE_TOKEN=1 → initialize / tools/list / tools/call return 401 without token", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: true,
      requireTokenExplicit: true,
      publicUrl: "http://127.0.0.1:7420",
    });
    for (const [i, call] of MCP_METHODS.entries()) {
      const res = await app.request("http://127.0.0.1/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: mcpBody(call.method, call.params as Record<string, unknown>, i + 1),
      });
      expect(res.status, call.method).toBe(401);
    }
  });

  it("default loopback + proxy headers → /mcp 401 for initialize / list / call; pair/start refused", async () => {
    // DEFAULT config: RELAY_HOST=127.0.0.1, no RELAY_REQUIRE_TOKEN.
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: false,
      requireTokenExplicit: false,
      publicUrl: "http://127.0.0.1:7420",
    });
    const headers = {
      "Content-Type": "application/json",
      "X-Forwarded-For": "100.64.1.2",
    };
    for (const [i, call] of MCP_METHODS.entries()) {
      const res = await app.request("http://127.0.0.1/mcp", {
        method: "POST",
        headers,
        body: mcpBody(call.method, call.params as Record<string, unknown>, i + 1),
      });
      expect(res.status, call.method).toBe(401);
    }
    expect(
      (
        await app.request("http://127.0.0.1/api/pair/start", {
          method: "POST",
          headers: { "X-Forwarded-For": "100.64.1.2" },
        })
      ).status,
    ).toBe(401);
    expect(
      (await app.request("http://127.0.0.1/api/items", { headers })).status,
    ).toBe(401);
  });

  it("loopback without proxy headers still allows /mcp", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: false,
    });
    const res = await app.request("http://127.0.0.1/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: mcpBody("tools/list", {}),
    });
    // Auth passes; MCP handler may return 2xx/4xx JSON-RPC — not 401.
    expect(res.status).not.toBe(401);
  });
});
