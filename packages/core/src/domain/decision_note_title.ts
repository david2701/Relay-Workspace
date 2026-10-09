export type DecisionNoteLocale = "en" | "fr" | "es";

const DECISION_PREFIX: Record<DecisionNoteLocale, string> = {
  en: "Decision: ",
  fr: "Décision : ",
  es: "Decisión: ",
};

/** Max length of the full note title (prefix + truncated item title). */
export const DECISION_NOTE_TITLE_MAX = 80;

/**
 * Truncate `text` to at most `maxLen` characters on a word boundary, appending
 * an ellipsis when truncated. If no space exists in the window, hard-cut.
 */
export function truncateAtWordBoundary(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (maxLen <= 0) return "";
  if (trimmed.length <= maxLen) return trimmed;
  if (maxLen === 1) return "…";
  const window = trimmed.slice(0, maxLen - 1);
  const lastSpace = window.lastIndexOf(" ");
  const base = (lastSpace > 0 ? window.slice(0, lastSpace) : window).replace(
    /\s+$/u,
    "",
  );
  return `${base}…`;
}

/**
 * Decision-note title: i18n prefix + item title (never the answer body).
 * Truncates on a word boundary when over {@link DECISION_NOTE_TITLE_MAX}.
 */
export function buildDecisionNoteTitle(
  itemTitle: string,
  locale: DecisionNoteLocale = "en",
  maxLen: number = DECISION_NOTE_TITLE_MAX,
): string {
  const prefix = DECISION_PREFIX[locale] ?? DECISION_PREFIX.en;
  const budget = Math.max(1, maxLen - prefix.length);
  return `${prefix}${truncateAtWordBoundary(itemTitle, budget)}`;
}
