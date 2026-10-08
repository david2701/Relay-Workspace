import { describe, expect, it } from "vitest";
import { translate } from "./translate";

describe("plural rules", () => {
  it("items plural in en-US, fr-FR, es-ES", () => {
    expect(translate("en", "plural.items", { n: 0 })).toBe("No items");
    expect(translate("en", "plural.items", { n: 1 })).toBe("1 item");
    expect(translate("en", "plural.items", { n: 2 })).toBe("2 items");

    expect(translate("fr", "plural.items", { n: 0 })).toBe("Aucun élément");
    expect(translate("fr", "plural.items", { n: 1 })).toBe("1 élément");
    expect(translate("fr", "plural.items", { n: 2 })).toBe("2 éléments");

    expect(translate("es", "plural.items", { n: 0 })).toBe("Ningún ítem");
    expect(translate("es", "plural.items", { n: 1 })).toBe("1 ítem");
    expect(translate("es", "plural.items", { n: 2 })).toBe("2 ítems");
  });

  it("needsYou plural in en-US, fr-FR, es-ES", () => {
    expect(translate("en", "plural.needsYou", { n: 0 })).toBe("None need you");
    expect(translate("en", "plural.needsYou", { n: 1 })).toBe("1 needs you");
    expect(translate("en", "plural.needsYou", { n: 2 })).toBe("2 need you");

    expect(translate("fr", "plural.needsYou", { n: 0 })).toBe(
      "Aucun ne vous attend",
    );
    expect(translate("fr", "plural.needsYou", { n: 1 })).toBe("1 vous attend");
    expect(translate("fr", "plural.needsYou", { n: 2 })).toBe(
      "2 vous attendent",
    );

    expect(translate("es", "plural.needsYou", { n: 0 })).toBe(
      "Ninguno te necesita",
    );
    expect(translate("es", "plural.needsYou", { n: 1 })).toBe("1 te necesita");
    expect(translate("es", "plural.needsYou", { n: 2 })).toBe(
      "2 te necesitan",
    );
  });
});
