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
    svc.close();
  });

  it("initialFromName takes the first grapheme", () => {
    expect(initialFromName("élodie", "fr")).toBe("É");
    expect(initialFromName("Ana", "es")).toBe("A");
    expect(initialFromName("  Alex  ")).toBe("A");
  });
});
