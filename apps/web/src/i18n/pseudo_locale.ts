/**
 * ui-spec §4.3 — en-XA pseudo-locale for layout expansion tests.
 * Activate with `?locale=en-XA` or `RELAY_PSEUDO_LOCALE=1` (dev/QA only).
 */

const MAP: Record<string, string> = {
  a: "á",
  e: "é",
  i: "î",
  o: "ö",
  u: "ü",
  c: "ç",
  n: "ñ",
  s: "š",
  A: "Á",
  E: "É",
  I: "Î",
  O: "Ö",
  U: "Ü",
  C: "Ç",
  N: "Ñ",
  S: "Ŝ",
};

let enabled: boolean | null = null;

export function isPseudoLocaleEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("locale") === "en-XA") {
      enabled = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  enabled = import.meta.env.DEV && import.meta.env.VITE_RELAY_PSEUDO_LOCALE === "1";
  return enabled;
}

/** Transform a resolved EN string: accents + +40% pad + ⟦ ⟧ wrappers; keep ICU braces. */
export function applyPseudoLocale(text: string): string {
  if (!text) return text;
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      const end = text.indexOf("}", i);
      if (end === -1) {
        parts.push(text.slice(i));
        break;
      }
      parts.push(text.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    const ch = text[i]!;
    parts.push(MAP[ch] ?? ch);
    i += 1;
  }
  const accented = parts.join("");
  const target = Math.ceil(accented.length * 1.4);
  let padded = accented;
  while (padded.length < target) padded += "·~";
  return `⟦${padded}⟧`;
}
