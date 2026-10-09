import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PAIRING_CODE_TTL_MS,
  PAIRING_MAX_ATTEMPTS,
  PairingRateLimitError,
  RelayService,
  ValidationError,
  hashToken,
} from "../src/index.js";

describe("devices + pairing", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-dev-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores only the token hash, never the plaintext", () => {
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const created = svc.claimPairing({
      code: session.code,
      device_name: "Pixel",
      platform: "android",
      clientIp: "127.0.0.1",
    });
    expect(created.token.length).toBeGreaterThan(20);
    expect(svc.databaseContainsPlaintextToken(created.token)).toBe(false);
    const row = svc.db
      .prepare(`SELECT token_hash FROM devices WHERE id = ?`)
      .get(created.device.id) as { token_hash: string };
    expect(row.token_hash).toBe(hashToken(created.token));
    expect(row.token_hash).not.toBe(created.token);
  });

  it("authenticates a valid token and rejects revoked", () => {
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const created = svc.claimPairing({
      code: session.code,
      device_name: "iPhone",
      platform: "ios",
      clientIp: "127.0.0.1",
    });
    const ok = svc.authenticateDeviceToken(created.token);
    expect(ok?.id).toBe(created.device.id);
    svc.revokeDevice(created.device.id);
    expect(svc.authenticateDeviceToken(created.token)).toBeNull();
  });

  it("pairing code is single-use", () => {
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    svc.claimPairing({
      code: session.code,
      device_name: "A",
      platform: "web",
      clientIp: "127.0.0.1",
    });
    expect(() =>
      svc.claimPairing({
        code: session.code,
        device_name: "B",
        platform: "web",
        clientIp: "127.0.0.1",
      }),
    ).toThrow(ValidationError);
  });

  it("pairing code expires", () => {
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    expect(Date.parse(session.expires_at)).toBeGreaterThan(
      Date.now() + PAIRING_CODE_TTL_MS - 5_000,
    );
    svc.db
      .prepare(`UPDATE pairing_codes SET expires_at = ? WHERE code = ?`)
      .run(new Date(Date.now() - 1000).toISOString(), session.code);
    expect(() =>
      svc.claimPairing({
        code: session.code,
        device_name: "Late",
        platform: "other",
        clientIp: "127.0.0.1",
      }),
    ).toThrow(ValidationError);
  });

  it("rate-limits failed claims per code", () => {
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    // Force failed_attempts via wrong path: mark as expired then try, or bump.
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i += 1) {
      svc.db
        .prepare(
          `UPDATE pairing_codes SET failed_attempts = failed_attempts + 1 WHERE code = ?`,
        )
        .run(session.code);
    }
    expect(() =>
      svc.claimPairing({
        code: session.code,
        device_name: "X",
        platform: "other",
        clientIp: "10.0.0.9",
      }),
    ).toThrow(PairingRateLimitError);
  });

  it("renames and lists devices without exposing hashes", () => {
    const session = svc.startPairing({ publicUrl: "http://127.0.0.1:7420" });
    const created = svc.claimPairing({
      code: session.code,
      device_name: "Old",
      platform: "web",
      clientIp: "127.0.0.1",
    });
    const renamed = svc.renameDevice(created.device.id, "New name");
    expect(renamed.name).toBe("New name");
    const list = svc.listDevices();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("token_hash");
    expect(JSON.stringify(list)).not.toContain(created.token);
  });
});
