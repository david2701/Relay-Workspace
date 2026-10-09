import { describe, expect, it } from "vitest";
import {
  buildDecisionNoteTitle,
  DECISION_NOTE_TITLE_MAX,
  truncateAtWordBoundary,
} from "../src/domain/decision_note_title.js";

describe("truncateAtWordBoundary", () => {
  it("returns text unchanged when under the limit", () => {
    expect(truncateAtWordBoundary("Short title", 80)).toBe("Short title");
  });

  it("cuts on a word boundary and appends an ellipsis", () => {
    const input = "Choose the launch post headline for the campaign";
    const actual = truncateAtWordBoundary(input, 28);
    expect(actual.endsWith("…")).toBe(true);
    expect(actual.includes("…")).toBe(true);
    expect(actual.length).toBeLessThanOrEqual(28);
    expect(actual).not.toMatch(/\s…$/u);
    // Prefer ending on a full word, not mid-word "headli…"
    expect(actual).toBe("Choose the launch post…");
  });
});

describe("buildDecisionNoteTitle", () => {
  it("uses an i18n prefix plus the item title (not the answer body)", () => {
    const title = "Choose the launch post headline";
    expect(buildDecisionNoteTitle(title, "en")).toBe(`Decision: ${title}`);
    expect(buildDecisionNoteTitle(title, "fr")).toBe(`Décision : ${title}`);
    expect(buildDecisionNoteTitle(title, "es")).toBe(`Decisión: ${title}`);
  });

  it("truncates long item titles on a word boundary within the max length", () => {
    const long =
      "Choose the launch post headline for the worldwide product announcement wave";
    const actual = buildDecisionNoteTitle(long, "en");
    expect(actual.startsWith("Decision: ")).toBe(true);
    expect(actual.length).toBeLessThanOrEqual(DECISION_NOTE_TITLE_MAX);
    expect(actual.endsWith("…")).toBe(true);
    expect(actual).not.toMatch(/headli…$/u);
  });
});
