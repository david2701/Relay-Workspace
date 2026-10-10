import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { createSseHub, type SseHub } from "../src/sse_hub.js";

describe("POST /api/store/e2e-reset", () => {
  let dir: string;
  let svc: RelayService;
  let hub: SseHub;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-e2e-reset-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    hub = createSseHub(svc, { watchIntervalMs: 50 });
  });

  afterEach(() => {
    hub.close();
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("is absent (404) when e2eMode is false — production default", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      streamHub: hub,
      e2eMode: false,
    });
    const res = await app.request("http://127.0.0.1/api/store/e2e-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("rejects proxied peers when e2eMode is on (auth 401, or 403 if authed)", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      streamHub: hub,
      e2eMode: true,
    });
    // Proxy headers force token auth before the handler runs → 401 without a token.
    const unauth = await app.request("http://127.0.0.1/api/store/e2e-reset", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify({}),
    });
    expect(unauth.status).toBe(401);
    // Even with a valid device token, the e2e gate refuses proxied peers.
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const claim = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "proxy-probe",
        platform: "web",
      }),
    });
    expect(claim.status).toBe(200);
    const claimed = (await claim.json()) as { token: string };
    const authed = await app.request("http://127.0.0.1/api/store/e2e-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.9",
        Authorization: `Bearer ${claimed.token}`,
      },
      body: JSON.stringify({}),
    });
    expect(authed.status).toBe(403);
    const body = (await authed.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("rejects non-loopback clients with 403 when e2eMode is on", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      streamHub: hub,
      e2eMode: true,
      resolveClientIp: () => "203.0.113.50",
    });
    const res = await app.request("http://127.0.0.1/api/store/e2e-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("reseeds baseline, completes onboarding, and clears SSE clients", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      streamHub: hub,
      e2eMode: true,
      resolveClientIp: () => "127.0.0.1",
    });
    const actor = { type: "user" as const, id: USER_ACTOR_ID };
    svc.createItem({ title: "pollute" }, actor, "ui");
    const stream = await app.request("http://127.0.0.1/api/stream?after_seq=0", {
      headers: { Accept: "text/event-stream" },
    });
    expect(stream.status).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect(hub.size).toBeGreaterThanOrEqual(1);
    const res = await app.request("http://127.0.0.1/api/store/e2e-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: "en" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      work_item_count: number;
      settings: { onboarding_completed_at: string | null };
      seq: number;
      sse_clients: number;
    };
    expect(body.ok).toBe(true);
    expect(body.work_item_count).toBeGreaterThan(0);
    expect(body.settings.onboarding_completed_at).toBeTruthy();
    expect(body.seq).toBe(svc.latestSeq());
    expect(body.sse_clients).toBe(0);
    expect(hub.size).toBe(0);
    stream.body?.cancel().catch(() => {});
  });
});
