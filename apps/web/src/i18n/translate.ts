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

function pluralRules(locale: LocaleCode): Intl.PluralRules {
  let r = pluralCache.get(locale);
  if (!r) {
    const tag =
      locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-US";
    r = new Intl.PluralRules(tag);
    pluralCache.set(locale, r);
  }
  return r;
}

/**
 * Minimal ICU-ish plural: `{n, plural, =0 {...} one {...} other {...}}`
 * plus `{name}` interpolation. No external i18n library — typed JSON + Intl.
 */
function pluralClause(body: string, n: number, locale: LocaleCode): string {
  const rule = Number.isFinite(n) ? pluralRules(locale).select(n) : "other";
  const exact = body.match(new RegExp(`=${n}\\s*\\{([^}]*)\\}`));
  if (exact?.[1] !== undefined) return exact[1].replace(/#/g, String(n));
  const named = body.match(new RegExp(`${rule}\\s*\\{([^}]*)\\}`));
  if (named?.[1] !== undefined) return named[1].replace(/#/g, String(n));
  const other = body.match(/other\s*\{([^}]*)\}/);
  return (other?.[1] ?? "").replace(/#/g, String(n));
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
      out += pluralClause(body, n, locale);
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
