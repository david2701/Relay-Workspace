import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/index.js";
import { invokeMcpTool } from "../src/mcp/http.js";
import { startPushRuntime } from "../src/push/index.js";
import {
  APNS_CATEGORY_RELAY_ITEM,
  FCM_CHANNEL_ID,
} from "../src/push/types.js";
import { createSseHub } from "../src/sse_hub.js";
import {
  createTlsMaterial,
  generateApnsP8,
  generateFcmServiceAccount,
  startMockApns,
  startMockFcm,
} from "./helpers/mock_push_servers.js";

const APNS_TOKEN =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const FCM_TOKEN = "fcm-registration-token-android-device-001";

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitFor timeout");
}

describe("push notifications (APNs + FCM)", () => {
  let dir: string;
  let svc: RelayService;
  let hub: ReturnType<typeof createSseHub>;
  let tls: ReturnType<typeof createTlsMaterial>;
  let apnsKey: ReturnType<typeof generateApnsP8>;
  let fcmSa: ReturnType<typeof generateFcmServiceAccount>;
  let mockApns: Awaited<ReturnType<typeof startMockApns>>;
  let mockFcm: Awaited<ReturnType<typeof startMockFcm>>;
  let pushRuntime: ReturnType<typeof startPushRuntime>;
  let app: ReturnType<typeof createApp>;
  let logs: string[];
  let deviceToken: string;
  let deviceId: string;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };
  const agent = { type: "agent" as const, id: "agent-code" };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "relay-push-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    hub = createSseHub(svc, { watchIntervalMs: 30, heartbeatIntervalMs: 60_000 });
    tls = createTlsMaterial();
    apnsKey = generateApnsP8();
    fcmSa = generateFcmServiceAccount();
    const p8Path = join(dir, "AuthKey.p8");
    writeFileSync(p8Path, apnsKey.privateKeyPem, "utf8");
    mockApns = await startMockApns(tls);
    mockFcm = await startMockFcm();
    logs = [];
    pushRuntime = startPushRuntime({
      svc,
      hub,
      env: {
        RELAY_APNS_KEY_PATH: p8Path,
        RELAY_APNS_KEY_ID: apnsKey.keyId,
        RELAY_APNS_TEAM_ID: apnsKey.teamId,
        RELAY_APNS_TOPIC: "com.example.relay",
        RELAY_FCM_CREDENTIALS_PATH: fcmSa.credentialsPath,
        RELAY_PUSH_SKIP_OPEN_SSE: "1",
        RELAY_PUSH_DEDUPE_MS: "2000",
        RELAY_PUSH_REMINDER_POLL_MS: "60000",
      },
      log: (line) => {
        logs.push(line);
      },
      apnsAuthorities: {
        production: mockApns.authority,
        sandbox: mockApns.authority,
        rejectUnauthorized: false,
      },
      fcmEndpoints: {
        tokenUrl: mockFcm.tokenUrl,
        sendUrlTemplate: mockFcm.sendUrlTemplate,
      },
    });
    app = createApp(svc, "http://127.0.0.1:7421", {
      streamHub: hub,
      pushRuntime,
      requireToken: true,
      requireTokenExplicit: true,
      publicUrl: "http://127.0.0.1:7420",
    });
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const created = svc.claimPairing({
      code: session.code,
      device_name: "Test Phone",
      platform: "ios",
      clientIp: "127.0.0.1",
    });
    deviceToken = created.token;
    deviceId = created.device.id;
  });

  afterEach(async () => {
    pushRuntime.close();
    hub.close();
    svc.close();
    await mockApns.close();
    await mockFcm.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(tls.dir, { recursive: true, force: true });
    rmSync(fcmSa.dir, { recursive: true, force: true });
  });

  async function registerApns(opts?: { muted?: boolean; token?: string }) {
    const res = await app.request("http://127.0.0.1/api/devices/me/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: "apns",
        token: opts?.token ?? APNS_TOKEN,
        environment: "sandbox",
        topic: "com.example.relay",
        muted: opts?.muted,
      }),
    });
    expect(res.status).toBe(200);
    return res.json();
  }

  async function registerFcm(token = FCM_TOKEN) {
    const res = await app.request("http://127.0.0.1/api/devices/me/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: "fcm",
        token,
        environment: "production",
      }),
    });
    expect(res.status).toBe(200);
  }

  it("registers and deletes push tokens; revoke clears them", async () => {
    const body = (await registerApns()) as {
      push: { registered: boolean; platform: string };
      device: { has_push_token: boolean };
    };
    expect(body.push.registered).toBe(true);
    expect(body.push.platform).toBe("apns");
    expect(body.device.has_push_token).toBe(true);
    const del = await app.request("http://127.0.0.1/api/devices/me/push", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deviceToken}` },
    });
    expect(del.status).toBe(200);
    expect(svc.listDevicePushTargets()).toHaveLength(0);

    await registerApns();
    await app.request(`http://127.0.0.1/api/devices/${deviceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deviceToken}` },
    });
    expect(svc.listDevicePushTargets()).toHaveLength(0);
    const row = svc.db
      .prepare(`SELECT push_token FROM devices WHERE id = ?`)
      .get(deviceId) as { push_token: string | null };
    expect(row.push_token).toBeNull();
  });

  it("APNs JWT headers/claims are correct and the cached JWT is reused", async () => {
    await registerApns();
    const item = svc.createItem({ title: "Ask" }, actor, "ui");
    svc.askUser(item.id, "Pick A or B please", agent, "mcp");
    await waitFor(() => mockApns.requests.length >= 1);
    await pushRuntime.dispatcher?.flush();
    const first = mockApns.requests[0];
    expect(first?.jwtHeader.alg).toBe("ES256");
    expect(first?.jwtHeader.kid).toBe(apnsKey.keyId);
    expect(first?.jwtPayload.iss).toBe(apnsKey.teamId);
    expect(typeof first?.jwtPayload.iat).toBe("number");
    expect(first?.headers["apns-push-type"]).toBe("alert");
    expect(first?.headers["apns-topic"]).toBe("com.example.relay");
    expect(first).toBeDefined();
    const aps = (first.body as { aps: Record<string, unknown> }).aps;
    expect(aps.category).toBe(APNS_CATEGORY_RELAY_ITEM);
    expect(aps["thread-id"]).toBe(item.id);

    const jwt1 = first?.headers.authorization;
    // Second trigger within cache window should reuse the same JWT string.
    const item2 = svc.createItem({ title: "Ask 2" }, actor, "ui");
    svc.askUser(item2.id, "Another question here", agent, "mcp");
    await waitFor(() => mockApns.requests.length >= 2);
    await pushRuntime.dispatcher?.flush();
    const jwt2 = mockApns.requests[1]?.headers.authorization;
    expect(jwt2).toBe(jwt1);
  });

  it("each trigger sends one push; duplicate within window does not", async () => {
    await registerApns();
    const item = svc.createItem({ title: "Once" }, actor, "ui");
    svc.askUser(item.id, "Need a decision now", agent, "mcp");
    await waitFor(() => mockApns.requests.length === 1);
    // Same needs_you again via setStatus would be a new event — use dispatcher
    // handleEvents with a synthetic duplicate reason for the same item.
    await pushRuntime.dispatcher?.handleEvents([
      {
        id: "evt_dupetest01",
        seq: 999_001,
        item_id: item.id,
        type: "status_changed",
        actor_kind: "agent",
        actor_id: "agent-code",
        payload: { from: "assigned", to: "needs_you" },
        created_at: new Date().toISOString(),
      },
    ]);
    await pushRuntime.dispatcher?.flush();
    expect(mockApns.requests).toHaveLength(1);
  });

  it("device with an open SSE stream gets no push (D4)", async () => {
    await registerApns();
    const ac = new AbortController();
    const stream = await app.request("http://127.0.0.1/api/stream", {
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        "Last-Event-ID": "0",
      },
      signal: ac.signal,
    });
    expect(stream.status).toBe(200);
    await waitFor(() => hub.hasDeviceStream(deviceId));
    const item = svc.createItem({ title: "SSE open" }, actor, "ui");
    svc.askUser(item.id, "Should not push while SSE", agent, "mcp");
    hub.pollOnce();
    await pushRuntime.dispatcher?.flush();
    await new Promise((r) => setTimeout(r, 80));
    expect(mockApns.requests).toHaveLength(0);
    ac.abort();
    stream.body?.cancel();
  });

  it("revoked device gets no push and its token is gone", async () => {
    await registerApns();
    svc.revokeDevice(deviceId);
    expect(svc.listDevicePushTargets()).toHaveLength(0);
    const item = svc.createItem({ title: "Revoked" }, actor, "ui");
    svc.askUser(item.id, "No device left", agent, "mcp");
    hub.pollOnce();
    await pushRuntime.dispatcher?.flush();
    await new Promise((r) => setTimeout(r, 80));
    expect(mockApns.requests).toHaveLength(0);
  });

  it("410 BadDeviceToken clears the APNs token", async () => {
    mockApns.deadTokens.add(APNS_TOKEN);
    await registerApns();
    const item = svc.createItem({ title: "Dead token" }, actor, "ui");
    svc.askUser(item.id, "Clear me please", agent, "mcp");
    await waitFor(() => mockApns.requests.length >= 1);
    await pushRuntime.dispatcher?.flush();
    expect(svc.getDevice(deviceId).has_push_token).toBe(false);
  });

  it("FCM UNREGISTERED clears the token; JWT is RS256 and cached", async () => {
    await registerFcm();
    const item = svc.createItem(
      { title: "Assign me", assignee_type: "user" },
      actor,
      "ui",
    );
    // created with assignee user → assigned reason
    void item;
    await waitFor(() => mockFcm.sends.length >= 1);
    await pushRuntime.dispatcher?.flush();
    expect(mockFcm.assertions[0]?.header.alg).toBe("RS256");
    expect(mockFcm.assertions[0]?.payload.iss).toBe(
      fcmSa.credentials.client_email,
    );
    expect(mockFcm.accessTokensIssued).toHaveLength(1);
    const sendBody = mockFcm.sends[0]?.body as {
      message: {
        data: { item_id: string; reason: string };
        android: { notification: { channel_id: string } };
      };
    };
    expect(sendBody.message.android.notification.channel_id).toBe(
      FCM_CHANNEL_ID,
    );
    const auth1 = mockFcm.sends[0]?.authorization;

    // Second send reuses OAuth access token
    svc.updateItem(
      svc.createItem({ title: "B" }, actor, "ui").id,
      { assignee_type: "user" },
      actor,
    );
    await waitFor(() => mockFcm.sends.length >= 2);
    await pushRuntime.dispatcher?.flush();
    expect(mockFcm.accessTokensIssued).toHaveLength(1);
    expect(mockFcm.sends[1]?.authorization).toBe(auth1);

    mockFcm.deadTokens.add(FCM_TOKEN);
    // Re-register same token after prior clears... still registered from above
    const still = svc.listDevicePushTargets();
    expect(still.length).toBeGreaterThan(0);
    const item3 = svc.createItem({ title: "Kill" }, actor, "ui");
    svc.askUser(item3.id, "Unregister path", agent, "mcp");
    await waitFor(() => mockFcm.sends.length >= 3);
    await pushRuntime.dispatcher?.flush();
    expect(svc.getDevice(deviceId).has_push_token).toBe(false);
  });

  it("a write over MCP triggers a push", async () => {
    await registerApns();
    const item = svc.createItem({ title: "MCP ask" }, actor, "ui");
    await invokeMcpTool(svc, "items_ask_user", {
      id: item.id,
      reason: "MCP needs a choice now",
      actor: { type: "agent", id: "agent-code" },
    });
    await waitFor(() => mockApns.requests.length >= 1);
    await pushRuntime.dispatcher?.flush();
    const body = mockApns.requests[0]?.body as {
      reason: string;
      item_id: string;
    };
    expect(body.reason).toBe("needs_you");
    expect(body.item_id).toBe(item.id);
  });

  it("reminder_fired triggers a push", async () => {
    await registerApns();
    const past = "2020-06-01T10:00:00.000Z";
    const item = svc.createItem(
      {
        title: "Reminder title",
        reminder_at: past,
        reminder_intent: "wake",
      },
      actor,
      "ui",
    );
    const n = pushRuntime.reminders.pollOnce();
    expect(n).toBe(1);
    hub.pollOnce();
    await waitFor(() => mockApns.requests.length >= 1);
    await pushRuntime.dispatcher?.flush();
    const body = mockApns.requests[0]?.body as {
      reason: string;
      item_id: string;
    };
    expect(body.reason).toBe("reminder");
    expect(body.item_id).toBe(item.id);
  });

  it("redact mode drops the title from the payload", async () => {
    pushRuntime.close();
    const p8Path = join(dir, "AuthKey.p8");
    pushRuntime = startPushRuntime({
      svc,
      hub,
      env: {
        RELAY_APNS_KEY_PATH: p8Path,
        RELAY_APNS_KEY_ID: apnsKey.keyId,
        RELAY_APNS_TEAM_ID: apnsKey.teamId,
        RELAY_APNS_TOPIC: "com.example.relay",
        RELAY_PUSH_REDACT: "1",
        RELAY_PUSH_SKIP_OPEN_SSE: "1",
        RELAY_PUSH_DEDUPE_MS: "2000",
      },
      log: (line) => logs.push(line),
      apnsAuthorities: {
        production: mockApns.authority,
        sandbox: mockApns.authority,
        rejectUnauthorized: false,
      },
    });
    await registerApns();
    const item = svc.createItem({ title: "Secret Title Body" }, actor, "ui");
    svc.askUser(item.id, "Redacted please", agent, "mcp");
    await waitFor(() => mockApns.requests.length >= 1);
    await pushRuntime.dispatcher?.flush();
    const body = mockApns.requests[0]?.body as {
      reason: string;
      item_id: string;
      aps: { alert: { title?: string; body?: string } };
    };
    expect(body.item_id).toBe(item.id);
    expect(body.reason).toBe("needs_you");
    expect(body.aps.alert.body).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Secret Title Body");
  });

  it("muted device receives no push", async () => {
    await registerApns({ muted: true });
    const item = svc.createItem({ title: "Muted" }, actor, "ui");
    svc.askUser(item.id, "Should stay quiet", agent, "mcp");
    hub.pollOnce();
    await pushRuntime.dispatcher?.flush();
    await new Promise((r) => setTimeout(r, 80));
    expect(mockApns.requests).toHaveLength(0);
  });

  it("never logs push tokens, APNs keys, or device auth tokens", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await registerApns();
    const item = svc.createItem({ title: "Log check" }, actor, "ui");
    svc.askUser(item.id, "Watch the logs", agent, "mcp");
    await waitFor(() => mockApns.requests.length >= 1);
    await pushRuntime.dispatcher?.flush();
    const all = [
      ...logs,
      ...infoSpy.mock.calls.map((c) => c.map(String).join(" ")),
      ...errSpy.mock.calls.map((c) => c.map(String).join(" ")),
    ].join("\n");
    expect(all).not.toContain(APNS_TOKEN);
    expect(all).not.toContain(deviceToken);
    expect(all).not.toContain(apnsKey.privateKeyPem);
    expect(all).not.toContain("BEGIN PRIVATE KEY");
    infoSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("assigned-to-user triggers a push", async () => {
    await registerApns();
    const item = svc.createItem({ title: "Inbox" }, actor, "ui");
    svc.updateItem(item.id, { assignee_type: "user" }, actor);
    await waitFor(() => mockApns.requests.length >= 1);
    await pushRuntime.dispatcher?.flush();
    const body = mockApns.requests[0]?.body as { reason: string };
    expect(body.reason).toBe("assigned");
  });
});

describe("push disabled without credentials", () => {
  it("logs a single disabled line and does not throw", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-push-off-"));
    const svc = new RelayService({ dbPath: join(dir, "t.db") });
    const hub = createSseHub(svc, { watchIntervalMs: 50 });
    const logs: string[] = [];
    const runtime = startPushRuntime({
      svc,
      hub,
      env: {},
      log: (line) => logs.push(line),
    });
    expect(runtime.config.enabled).toBe(false);
    expect(runtime.dispatcher).toBeNull();
    expect(logs).toEqual(["Push: disabled (no APNs/FCM credentials)"]);
    runtime.close();
    hub.close();
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
