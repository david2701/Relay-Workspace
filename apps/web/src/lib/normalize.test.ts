import { describe, expect, it } from "vitest";
import { matchesQuery, stripDiacritics, toPlainText } from "./normalize";

describe("accent normalization", () => {
  it("strips diacritics and lowercases", () => {
    expect(stripDiacritics("Démo")).toBe("demo");
    expect(stripDiacritics("UNICÓRNIO")).toBe("unicornio");
  });

  it("AND-matches words regardless of order and accents (V12-F2)", () => {
    expect(matchesQuery("Démo cliente staging", "demo")).toBe(true);
    expect(matchesQuery("Démo cliente staging", "demo staging")).toBe(true);
    expect(matchesQuery("Démo cliente", "demo staging")).toBe(false);
    expect(matchesQuery("staging Démo", "demo staging")).toBe(true);
  });

  it("plain-text strips markdown noise", () => {
    expect(toPlainText("**demo** con `code`")).toContain("demo");
    expect(toPlainText("**demo** con `code`")).not.toContain("*");
  });
});
