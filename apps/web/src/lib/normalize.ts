/** Accent-insensitive lowercase (NFD + strip combining marks). */
export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** True when every whitespace-separated word of `query` appears in `haystack`. */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const hay = stripDiacritics(haystack);
  const words = stripDiacritics(q)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return true;
  return words.every((w) => hay.includes(w));
}

export { toPlainText } from "./markdown";
