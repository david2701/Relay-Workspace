import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "../components/Markdown";
import {
  clearNoteDraft,
  draftIsNewer,
  readNoteDraft,
  sanitizeUrl,
  toggleTask,
  toPlainText,
  urlTransform,
  writeNoteDraft,
} from "./markdown";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/note-all-md.md"),
  "utf8",
);

describe("toPlainText", () => {
  it("strips markdown syntax for extracts (V12-M1)", () => {
    const plain = toPlainText(
      "# Título\n\n**negrita** y `code`\n\n- [ ] tarea\n\n[link](https://x.test)",
    );
    expect(plain).not.toMatch(/[#*`]/);
    expect(plain).not.toContain("[ ]");
    expect(plain).toContain("Título");
    expect(plain).toContain("negrita");
    expect(plain).toContain("code");
    expect(plain).toContain("tarea");
    expect(plain).toContain("link");
  });

  it("respects maxChars", () => {
    const plain = toPlainText("abcdefghij", 5);
    expect(plain).toBe("abcde…");
  });
});

describe("sanitizeUrl / urlTransform", () => {
  it("allows http(s), mailto, and relative /", () => {
    expect(sanitizeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
    expect(sanitizeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(sanitizeUrl("/all?item=itm_1")).toBe("/all?item=itm_1");
    expect(urlTransform("/notes?note=n1")).toBe("/notes?note=n1");
  });

  it("blocks javascript:, data:, file:, and protocol-relative", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBe("");
    expect(sanitizeUrl("data:text/html,x")).toBe("");
    expect(sanitizeUrl("file:///etc/passwd")).toBe("");
    expect(sanitizeUrl("//evil.example")).toBe("");
  });
});

describe("toggleTask", () => {
  it("toggles only the marker on the target line (V12-M9)", () => {
    const md = "- [ ] Revisar copy\n- [ ] Pasar a QA\n- [x] Ya hecho\n";
    const offset = md.indexOf("Pasar");
    const next = toggleTask(md, offset);
    expect(next).toBe("- [ ] Revisar copy\n- [x] Pasar a QA\n- [x] Ya hecho\n");
    // Diff is a single character in the marker body
    let diffs = 0;
    for (let i = 0; i < md.length; i++) {
      if (md[i] !== next[i]) diffs += 1;
    }
    expect(diffs).toBe(1);
  });

  it("untoggles a checked task", () => {
    const md = "- [x] Ya hecho";
    expect(toggleTask(md, 0)).toBe("- [ ] Ya hecho");
  });
});

describe("Markdown sanitization (V12-M3–M6)", () => {
  function render(source: string): string {
    return renderToStaticMarkup(
      createElement(Markdown, { source, readOnly: true }),
    );
  }

  it("renders raw HTML as text, no script or on* attrs", () => {
    const html = render(
      "Antes <script>alert(1)</script> después\n\n<img src=x onerror=alert(1)>\n",
    );
    // No live elements — only escaped text (may still contain the word onerror).
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html).not.toMatch(/<[a-z][^>]*\son\w+=/i);
    expect(html).toContain("Antes");
    expect(html).toContain("después");
    expect(html).toContain("alert(1)");
  });

  it("shows javascript: links as text without <a>", () => {
    const html = render("[x](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("x");
  });

  it("does not emit <img> for external images; shows Imagen: alt", () => {
    const html = render("![logo](https://example.com/a.png)");
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html).toContain("Imagen: logo");
  });

  it("marks external links with target=_blank and noopener; internal same-tab", () => {
    const html = render(
      "[ext](https://example.com/docs) y [int](/all?item=itm_demo)",
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("↗");
    expect(html).toContain('href="/all?item=itm_demo"');
    // Internal link must not have target=_blank on the same anchor
    expect(html).toMatch(/href="\/all\?item=itm_demo"[^>]*>/);
    const internal = html.match(
      /<a class="md-a"[^>]*href="\/all\?item=itm_demo"[^>]*>/,
    );
    expect(internal?.[0] ?? "").not.toContain("target=");
  });

  it("fixture note-all-md.md stays script-free and image-free", () => {
    const html = render(fixture);
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html).not.toMatch(/<[a-z][^>]*\son\w+=/i);
    expect(html).toContain("Imagen: logo");
    expect(html).toContain('type="checkbox"');
  });
});

describe("draft recovery (V12-M15)", () => {
  const store = new Map<string, string>();

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("writes and reads drafts from localStorage keyed by note id", () => {
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });

    writeNoteDraft("nte_1", {
      body_md: "borrador",
      written_at: Date.parse("2026-10-08T10:00:00.000Z"),
      base_updated_at: "2026-10-08T09:00:00.000Z",
    });
    const draft = readNoteDraft("nte_1");
    expect(draft?.body_md).toBe("borrador");
    expect(
      draftIsNewer(
        draft!,
        "2026-10-08T09:00:00.000Z",
        "servidor",
      ),
    ).toBe(true);
    expect(
      draftIsNewer(
        draft!,
        "2026-10-08T09:00:00.000Z",
        "borrador",
      ),
    ).toBe(false);
    clearNoteDraft("nte_1");
    expect(readNoteDraft("nte_1")).toBeNull();
  });
});

describe("409 conflict helpers", () => {
  it("ApiError preserves status and current_updated_at", async () => {
    const { ApiError } = await import("./api");
    const err = new ApiError("Note was modified", {
      status: 409,
      code: "conflict",
      current_updated_at: "2026-10-08T12:00:00.000Z",
    });
    expect(err.status).toBe(409);
    expect(err.current_updated_at).toBe("2026-10-08T12:00:00.000Z");
    expect(err.message).toMatch(/modified/i);
  });
});
