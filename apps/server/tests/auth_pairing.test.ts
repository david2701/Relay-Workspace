import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/index.js";
import { createSseHub } from "../src/sse_hub.js";

async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event?: string; data?: string; comment?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const split = buf.indexOf("\n\n");
        if (split < 0) break;
        const raw = buf.slice(0, split);
        buf = buf.slice(split + 2);
        const frame: { event?: string; data?: string; comment?: string } = {};
        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) frame.comment = line.slice(1).trim();
          else if (line.startsWith("event:")) frame.event = line.slice(6).trim();
          else if (line.startsWith("data:")) {
            const piece = line.slice(5).trimStart();
            frame.data = frame.data ? `${frame.data}\n${piece}` : piece;
          }
        }
        yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

describe("LAN auth + pairing", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-auth-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("loopback works without a token", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: false,
    });
    const res = await app.request("http://127.0.0.1/api/health");
    expect(res.status).toBe(200);
    const items = await app.request("http://127.0.0.1/api/items");
    expect(items.status).toBe(200);
    const stream = await app.request("http://127.0.0.1/api/stream");
    expect(stream.status).toBe(200);
    stream.body?.cancel();
    const mcp = await app.request("http://127.0.0.1/mcp/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "notes_list", arguments: {} }),
    });
    expect(mcp.status).toBe(200);
  });

  it("RELAY_REQUIRE_TOKEN=1 → 401 without token on /api, /api/stream, /mcp/invoke", async () => {
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
    // Health + claim stay public
    const health = await app.request("http://127.0.0.1/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      require_token: true,
      require_token_explicit: true,
    });
  });

  it("valid token works; revoked token gets 401", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: true,
      requireTokenExplicit: true,
      publicUrl: "http://127.0.0.1:7420",
    });
    // Explicit mode: bootstrap via service/CLI, not HTTP pair/start.
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const claim = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "Test Phone",
        platform: "ios",
      }),
    });
    expect(claim.status).toBe(200);
    const { token, device_id } = (await claim.json()) as {
      token: string;
      device_id: string;
    };
    expect(svc.databaseContainsPlaintextToken(token)).toBe(false);

    const ok = await app.request("http://127.0.0.1/api/items", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);

    await app.request(`http://127.0.0.1/api/devices/${device_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const denied = await app.request("http://127.0.0.1/api/items", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(denied.status).toBe(401);
  });

  it("pair/start refused from non-loopback without device token", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: true,
      publicUrl: "http://192.168.1.10:7420",
      resolveClientIp: () => "192.168.1.50",
    });
    const res = await app.request("http://192.168.1.10/api/pair/start", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("pairing code single-use + rate limit + no token/code in logs", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: false,
      publicUrl: "http://127.0.0.1:7420",
    });
    const start = await app.request("http://127.0.0.1/api/pair/start", {
      method: "POST",
    });
    const session = (await start.json()) as { code: string; qr: unknown };
    const claim1 = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "A",
        platform: "android",
      }),
    });
    const { token } = (await claim1.json()) as { token: string };
    const claim2 = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "B",
        platform: "android",
      }),
    });
    expect(claim2.status).toBe(400);

    // Rate limit: exhaust attempts on a fresh code via failed claims.
    const start2 = await app.request("http://127.0.0.1/api/pair/start", {
      method: "POST",
    });
    const session2 = (await start2.json()) as { code: string };
    svc.db
      .prepare(
        `UPDATE pairing_codes SET failed_attempts = 5 WHERE code = ?`,
      )
      .run(session2.code);
    const limited = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session2.code,
        device_name: "C",
        platform: "android",
      }),
    });
    expect(limited.status).toBe(429);

    const allLogs = [
      ...infoSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...logSpy.mock.calls,
    ]
      .flat()
      .map(String)
      .join("\n");
    expect(allLogs).not.toContain(token);
    expect(allLogs).not.toContain(session.code);
    infoSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("SSE accepts short-lived access_token query param", async () => {
    const hub = createSseHub(svc, {
      maxConnections: 3,
      heartbeatIntervalMs: 200,
      watchIntervalMs: 40,
    });
    const app = createApp(svc, "http://127.0.0.1:7421", {
      requireToken: true,
      requireTokenExplicit: true,
      publicUrl: "http://127.0.0.1:7420",
      streamHub: hub,
    });
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const claim = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "SSE",
        platform: "web",
      }),
    });
    const { token } = (await claim.json()) as { token: string };

    const ticketRes = await app.request("http://127.0.0.1/api/stream/ticket", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ticketRes.status).toBe(200);
    const ticket = (await ticketRes.json()) as { access_token: string };

    svc.createItem(
      { title: "SSE auth item" },
      { type: "user", id: USER_ACTOR_ID },
      "ui",
    );

    const ac = new AbortController();
    const res = await app.request(
      `http://127.0.0.1/api/stream?access_token=${encodeURIComponent(ticket.access_token)}&after_seq=0`,
      { signal: ac.signal },
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    let sawEvent = false;
    for await (const frame of readSseFrames(res.body!)) {
      if (frame.event || frame.data || frame.comment) {
        sawEvent = true;
        break;
      }
    }
    ac.abort();
    hub.close();
    expect(sawEvent).toBe(true);

    // Bearer also works on stream
    const ac2 = new AbortController();
    const bearerStream = await app.request("http://127.0.0.1/api/stream", {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac2.signal,
    });
    expect(bearerStream.status).toBe(200);
    ac2.abort();
    bearerStream.body?.cancel();
  });
});
