import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialFromName, RelayService } from "../src/index.js";

describe("PR4 display name validation", () => {
  it("trims and rejects empty / overlong names on update", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-name-"));
    const svc = new RelayService({ dbPath: join(dir, "t.db") });
    expect(() => svc.updateSettings({ user_display_name: "   " })).toThrow();
    expect(() =>
      svc.updateSettings({ user_display_name: "x".repeat(41) }),
    ).toThrow();
    const next = svc.updateSettings({
      user_display_name: "  Élodie  ",
      user_initial: "É",
    });
    expect(next.user_display_name).toBe("Élodie");
    expect(next.user_initial).toBe("É");
    expect(next.onboarding_completed_at).toBeNull();
    svc.close();
  });

  it("initialFromName takes the first grapheme", () => {
    expect(initialFromName("élodie", "fr")).toBe("É");
    expect(initialFromName("Ana", "es")).toBe("A");
    expect(initialFromName("  Alex  ")).toBe("A");
  });

  it("persists onboarding_completed_at across get/update", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-onb-"));
    const svc = new RelayService({ dbPath: join(dir, "t.db") });
    expect(svc.getSettings().onboarding_completed_at).toBeNull();
    const at = "2026-10-08T12:00:00.000Z";
    const next = svc.updateSettings({ onboarding_completed_at: at });
    expect(next.onboarding_completed_at).toBe(at);
    expect(svc.getSettings().onboarding_completed_at).toBe(at);
    svc.prepareOnboardingProfile();
    expect(svc.getSettings().onboarding_completed_at).toBeNull();
    expect(svc.getSettings().user_display_name).toBe("");
    svc.close();
  });
});
