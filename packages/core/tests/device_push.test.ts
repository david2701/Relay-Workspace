import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_ACTOR_ID } from "../src/schemas/enums.js";
import { RelayService } from "../src/services/relay_service.js";

describe("device push registration + reminder_fired", () => {
  let dir: string;
  let svc: RelayService;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-push-core-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function pairDevice(name = "Phone") {
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    return svc.claimPairing({
      code: session.code,
      device_name: name,
      platform: "ios",
      clientIp: "127.0.0.1",
    });
  }

  it("stores push token on the device row and clears it on revoke", () => {
    const created = pairDevice();
    const updated = svc.registerDevicePush(created.device.id, {
      platform: "apns",
      token: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      environment: "sandbox",
      topic: "com.example.relay",
    });
    expect(updated.has_push_token).toBe(true);
    expect(updated.push_platform).toBe("apns");
    expect(updated).not.toHaveProperty("push_token");
    expect(svc.listDevicePushTargets()).toHaveLength(1);
    const revoked = svc.revokeDevice(created.device.id);
    expect(revoked.has_push_token).toBe(false);
    expect(svc.listDevicePushTargets()).toHaveLength(0);
  });

  it("DELETE clear and mute exclude targets", () => {
    const created = pairDevice("Muted");
    svc.registerDevicePush(created.device.id, {
      platform: "fcm",
      token: "fcm-registration-token-value-001",
      environment: "production",
      muted: true,
    });
    const targets = svc.listDevicePushTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0]?.muted).toBe(true);
    svc.clearDevicePush(created.device.id);
    expect(svc.listDevicePushTargets()).toHaveLength(0);
  });

  it("fireDueReminders emits reminder_fired once per reminder_at", () => {
    const past = "2020-01-01T00:00:00.000Z";
    const item = svc.createItem(
      { title: "Remind me", reminder_at: past, reminder_intent: "check" },
      actor,
      "ui",
    );
    const first = svc.fireDueReminders(new Date("2026-10-09T12:00:00.000Z"));
    expect(first).toHaveLength(1);
    expect(first[0]?.type).toBe("reminder_fired");
    expect(first[0]?.item_id).toBe(item.id);
    const second = svc.fireDueReminders(new Date("2026-10-09T12:01:00.000Z"));
    expect(second).toHaveLength(0);
  });

  it("clearDevicePushByToken removes a dead provider token", () => {
    const created = pairDevice("Dead");
    const token = "dead-token-should-be-cleared-xyz";
    svc.registerDevicePush(created.device.id, {
      platform: "apns",
      token,
      environment: "production",
    });
    expect(svc.clearDevicePushByToken(token)).toBe(1);
    expect(svc.getDevice(created.device.id).has_push_token).toBe(false);
  });
});
