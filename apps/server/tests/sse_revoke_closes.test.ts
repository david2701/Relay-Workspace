/**
 * Revoking a device must close its open SSE within 1s and invalidate tickets.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { createSseHub, type SseHub } from "../src/sse_hub.js";

describe("SSE closes on device revoke", () => {
  let dir: string;
  let svc: RelayService;
  let hub: SseHub;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-sse-revoke-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    hub = createSseHub(svc, { watchIntervalMs: 40, heartbeatIntervalMs: 200 });
  });

  afterEach(() => {
    hub.close();
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("open stream closes <1s after revoke; stream ticket becomes invalid", async () => {
    const app = createApp(svc, "http://127.0.0.1:7421", {
      streamHub: hub,
      requireToken: true,
      requireTokenExplicit: true,
      publicUrl: "http://127.0.0.1:7420",
    });
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const claim = await app.request("http://127.0.0.1/api/pair/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        device_name: "SSE Phone",
        platform: "ios",
      }),
    });
    expect(claim.status).toBe(200);
    const { token, device_id } = (await claim.json()) as {
      token: string;
      device_id: string;
    };

    const ticketRes = await app.request("http://127.0.0.1/api/stream/ticket", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ticketRes.status).toBe(200);
    const { access_token } = (await ticketRes.json()) as {
      access_token: string;
    };

    const streamRes = await app.request("http://127.0.0.1/api/stream", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(streamRes.status).toBe(200);
    expect(streamRes.body).toBeTruthy();
    const reader = streamRes.body!.getReader();
    // Wait until the hub has attached (first chunk / retry frame).
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(hub.size).toBeGreaterThanOrEqual(1);

    const closed = new Promise<number>((resolve, reject) => {
      const t0 = Date.now();
      const deadline = setTimeout(() => {
        reject(new Error("SSE_DID_NOT_CLOSE_WITHIN_1S"));
      }, 1000);
      void (async () => {
        try {
          while (true) {
            const { done } = await reader.read();
            if (done) {
              clearTimeout(deadline);
              resolve(Date.now() - t0);
              return;
            }
          }
        } catch {
          clearTimeout(deadline);
          resolve(Date.now() - t0);
        }
      })();
    });

    const revoke = await app.request(
      `http://127.0.0.1/api/devices/${device_id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(revoke.status).toBe(200);

    const elapsedMs = await closed;
    expect(elapsedMs).toBeLessThan(1000);
    expect(hub.size).toBe(0);

    // Ticket issued before revoke must no longer authenticate.
    const reuseTicket = await app.request(
      `http://127.0.0.1/api/stream?access_token=${access_token}`,
    );
    expect(reuseTicket.status).toBe(401);
    reuseTicket.body?.cancel();

    const apiDenied = await app.request("http://127.0.0.1/api/items", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(apiDenied.status).toBe(401);
  });
});
