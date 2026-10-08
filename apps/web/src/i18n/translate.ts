import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import type { LocaleCode, MessageDict, MessageKey } from "./types";

const catalogs: Record<LocaleCode, MessageDict> = {
  en: en as MessageDict,
  fr: fr as MessageDict,
  es: es as MessageDict,
};

const pluralCache = new Map<string, Intl.PluralRules>();
const numberCache = new Map<string, Intl.NumberFormat>();

function intlTag(locale: LocaleCode): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-US";
}

function pluralRules(locale: LocaleCode): Intl.PluralRules {
  let r = pluralCache.get(locale);
  if (!r) {
    r = new Intl.PluralRules(intlTag(locale));
    pluralCache.set(locale, r);
  }
  return r;
}

function numberFormat(locale: LocaleCode): Intl.NumberFormat {
  let f = numberCache.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(intlTag(locale));
    numberCache.set(locale, f);
  }
  return f;
}

/** Extract `{…}` contents allowing nested braces (for ICU plural arms). */
function extractBraceGroup(
  body: string,
  startIdx: number,
): { inner: string; end: number } | null {
  if (body[startIdx] !== "{") return null;
  let depth = 0;
  for (let j = startIdx; j < body.length; j += 1) {
    if (body[j] === "{") depth += 1;
    else if (body[j] === "}") {
      depth -= 1;
      if (depth === 0) {
        return { inner: body.slice(startIdx + 1, j), end: j + 1 };
      }
    }
  }
  return null;
}

/**
 * ICU plural subset: `{count, plural, =0 {…} one {…} other {…}}`
 * Supports `=N`, `one`, `other`, and `#` (NumberFormat). Nested `{var}` ok.
 */
function pluralClause(body: string, n: number, locale: LocaleCode): string {
  const rule = Number.isFinite(n) ? pluralRules(locale).select(n) : "other";
  const formatted = numberFormat(locale).format(n);
  let exactInner: string | null = null;
  let ruleInner: string | null = null;
  let otherInner: string | null = null;
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) i += 1;
    if (i >= body.length) break;
    const exact = body.slice(i).match(/^=(\d+)\s*/);
    const named = body.slice(i).match(/^(one|other|zero|two|few|many)\s*/);
    let label: string | null = null;
    let exactN: number | null = null;
    if (exact) {
      exactN = Number(exact[1]);
      i += exact[0].length;
    } else if (named) {
      label = named[1]!;
      i += named[0].length;
    } else {
      i += 1;
      continue;
    }
    const group = extractBraceGroup(body, i);
    if (!group) break;
    if (exactN !== null && exactN === n) exactInner = group.inner;
    if (label === rule) ruleInner = group.inner;
    if (label === "other") otherInner = group.inner;
    i = group.end;
  }
  const chosen = exactInner ?? ruleInner ?? otherInner ?? "";
  return chosen.replace(/#/g, formatted);
}

function interpolateSimple(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(vars[name] ?? ""),
  );
}

function formatMessage(
  template: string,
  locale: LocaleCode,
  vars: Record<string, string | number>,
): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const head = template.slice(open + 1);
    const pluralHead = head.match(/^(\w+),\s*plural,\s*/);
    if (pluralHead) {
      const name = pluralHead[1]!;
      let j = open + 1 + pluralHead[0].length;
      let depth = 1;
      const bodyStart = j;
      while (j < template.length && depth > 0) {
        const ch = template[j];
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        j += 1;
      }
      const body = template.slice(bodyStart, j - 1);
      const n = Number(vars[name] ?? 0);
      const arm = pluralClause(body, n, locale);
      out += interpolateSimple(arm, vars);
      i = j;
      continue;
    }
    const simple = head.match(/^(\w+)\}/);
    if (simple) {
      out += String(vars[simple[1]!] ?? "");
      i = open + 1 + simple[0].length;
      continue;
    }
    out += "{";
    i = open + 1;
  }
  return out;
}

export function translate(
  locale: LocaleCode,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const primary = catalogs[locale][key];
  const fallback = catalogs.en[key];
  const template = primary ?? fallback ?? String(key);
  if (Object.keys(vars).length === 0 && !template.includes("{")) {
    return template;
  }
  return formatMessage(template, locale, vars);
}

export function catalogKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}
