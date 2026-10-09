import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { formatPairCliOutput, startPairingViaCli } from "../src/pair_cli.js";

describe("proxy + explicit token security", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-proxy-auth-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("(a) DEFAULT loopback (no REQUIRE_TOKEN) + X-Forwarded-For → remote: 401 on /api, stream, /mcp, mcp/invoke; pair/start refused", async () => {
    // Exactly the default config: RELAY_HOST=127.0.0.1, unset RELAY_REQUIRE_TOKEN.
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: false,
      requireTokenExplicit: false,
    });
    const headers = { "X-Forwarded-For": "100.64.1.2" };
    expect(
      (await app.request("http://127.0.0.1/api/items", { headers })).status,
    ).toBe(401);
    expect(
      (await app.request("http://127.0.0.1/api/stream", { headers })).status,
    ).toBe(401);
    expect(
      (
        await app.request("http://127.0.0.1/mcp", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {},
          }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("http://127.0.0.1/mcp/invoke", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "notes_list", arguments: {} }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("http://127.0.0.1/api/pair/start", {
          method: "POST",
          headers,
        })
      ).status,
    ).toBe(401);
  });

  it("(b) Tailscale-User-Login header → same 401 gates", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: false,
    });
    const headers = { "Tailscale-User-Login": "alice@example.com" };
    expect(
      (await app.request("http://127.0.0.1/api/items", { headers })).status,
    ).toBe(401);
    expect(
      (await app.request("http://127.0.0.1/api/stream", { headers })).status,
    ).toBe(401);
    expect(
      (
        await app.request("http://127.0.0.1/mcp/invoke", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "notes_list", arguments: {} }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("http://127.0.0.1/api/pair/start", {
          method: "POST",
          headers,
        })
      ).status,
    ).toBe(401);
  });

  it("(c) RELAY_REQUIRE_TOKEN=1 explicit on loopback → 401; pair/start refused without auth", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: true,
      requireTokenExplicit: true,
      publicUrl: "http://127.0.0.1:7420",
    });
    expect((await app.request("http://127.0.0.1/api/items")).status).toBe(401);
    expect((await app.request("http://127.0.0.1/api/stream")).status).toBe(401);
    expect(
      (
        await app.request("http://127.0.0.1/mcp/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "notes_list", arguments: {} }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("http://127.0.0.1/api/pair/start", {
          method: "POST",
        })
      ).status,
    ).toBe(401);
  });

  it("(d) CLI admin pairing works; code is single use", async () => {
    const session = startPairingViaCli(svc, "http://127.0.0.1:7420");
    expect(session.code).toMatch(/^\d{6}$/);
    const printed = formatPairCliOutput(session);
    expect(printed).toContain(session.code);
    expect(printed).toContain(JSON.stringify(session.qr));

    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: true,
      requireTokenExplicit: true,
      publicUrl: "http://127.0.0.1:7420",
    });
    const claim1 = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "CLI Phone",
        platform: "ios",
      }),
    });
    expect(claim1.status).toBe(200);
    const { token } = (await claim1.json()) as { token: string };
    expect(token.length).toBeGreaterThan(20);

    const claim2 = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "Second",
        platform: "android",
      }),
    });
    expect(claim2.status).toBe(400);

    const ok = await app.request("http://127.0.0.1/api/items", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);

    // Authenticated device can start another pairing over HTTP.
    const start = await app.request("http://127.0.0.1/api/pair/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(start.status).toBe(200);
  });

  it("(e) default loopback without proxy headers is unchanged", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: false,
    });
    expect((await app.request("http://127.0.0.1/api/items")).status).toBe(200);
    const stream = await app.request("http://127.0.0.1/api/stream");
    expect(stream.status).toBe(200);
    stream.body?.cancel();
    expect(
      (
        await app.request("http://127.0.0.1/mcp/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "notes_list", arguments: {} }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request("http://127.0.0.1/api/pair/start", {
          method: "POST",
        })
      ).status,
    ).toBe(200);
  });
});
