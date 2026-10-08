/**
 * AC3-L2: fail if fr or es has fewer/more keys than en (source of truth).
 * Also validate ICU plural syntax and placeholder sets against EN.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "apps/web/src/i18n/locales");

function loadDict(locale) {
  return JSON.parse(readFileSync(resolve(dir, `${locale}.json`), "utf8"));
}

function loadKeys(dict) {
  return new Set(Object.keys(dict));
}

/** Simple `{name}` placeholders, excluding ICU plural heads `{n, plural, …}`. */
function simplePlaceholders(template) {
  const names = new Set();
  let i = 0;
  while (i < template.length) {
    if (template[i] !== "{") {
      i += 1;
      continue;
    }
    let depth = 0;
    let j = i;
    for (; j < template.length; j += 1) {
      if (template[j] === "{") depth += 1;
      else if (template[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    const inner = template.slice(i + 1, j - 1);
    const head = inner.split(",")[0]?.trim() ?? "";
    if (head && !/^\d+$/.test(head) && head !== "#") {
      // Skip ICU keywords used as arms inside plural bodies when nested wrongly
      if (!["plural", "select", "selectordinal"].includes(head)) {
        names.add(head);
      }
    }
    i = j;
  }
  return names;
}

/**
 * Validate balanced braces and ICU plural shape:
 * `{name, plural, =0 {…} one {…} other {…}}` — requires `other` arm when plural.
 */
function validateIcu(template) {
  let depth = 0;
  for (const ch of template) {
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth < 0) return "unbalanced }";
    }
  }
  if (depth !== 0) return "unbalanced {";

  // Find plural clauses
  const pluralRe = /\{([a-zA-Z_][\w]*),\s*plural\s*,/g;
  let m;
  while ((m = pluralRe.exec(template))) {
    const start = m.index;
    let d = 0;
    let end = -1;
    for (let i = start; i < template.length; i += 1) {
      if (template[i] === "{") d += 1;
      else if (template[i] === "}") {
        d -= 1;
        if (d === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return `plural unclosed at ${m[1]}`;
    const body = template.slice(start, end + 1);
    if (!/\bother\s*\{/.test(body)) {
      return `plural missing other arm (${m[1]})`;
    }
    // Malformed: empty arm or trailing comma garbage with no arm label
    if (/plural\s*,\s*\}/.test(body)) return `plural empty body (${m[1]})`;
    // Unclosed arm brace inside (already covered by balance) — catch `=0 {` without close via arm scan
    const after = body.replace(/^\{[^,]+,\s*plural\s*,/, "").replace(/\}$/, "");
    let i = 0;
    let sawArm = false;
    while (i < after.length) {
      while (i < after.length && /\s/.test(after[i])) i += 1;
      if (i >= after.length) break;
      const exact = after.slice(i).match(/^=\d+\s*/);
      const named = after.slice(i).match(/^(one|other|zero|two|few|many)\s*/);
      if (!exact && !named) {
        return `plural malformed arm near «${after.slice(i, i + 12)}» (${m[1]})`;
      }
      i += (exact ?? named)[0].length;
      if (after[i] !== "{") return `plural arm missing { (${m[1]})`;
      let ad = 0;
      const armStart = i;
      for (; i < after.length; i += 1) {
        if (after[i] === "{") ad += 1;
        else if (after[i] === "}") {
          ad -= 1;
          if (ad === 0) {
            i += 1;
            break;
          }
        }
      }
      if (ad !== 0) return `plural arm unclosed (${m[1]}) at ${armStart}`;
      sawArm = true;
    }
    if (!sawArm) return `plural has no arms (${m[1]})`;
  }
  return null;
}

const enDict = loadDict("en");
const frDict = loadDict("fr");
const esDict = loadDict("es");
const en = loadKeys(enDict);
const fr = loadKeys(frDict);
const es = loadKeys(esDict);

function diff(label, base, other) {
  const missing = [...base].filter((k) => !other.has(k)).sort();
  const extra = [...other].filter((k) => !base.has(k)).sort();
  return { label, missing, extra };
}

const reports = [diff("fr", en, fr), diff("es", en, es)];
let failed = false;

for (const r of reports) {
  if (r.missing.length === 0 && r.extra.length === 0) {
    console.log(`check:i18n-missing-keys: ${r.label} OK (${en.size} keys)`);
    continue;
  }
  failed = true;
  if (r.missing.length) {
    console.error(
      `check:i18n-missing-keys: ${r.label} missing vs en:\n  - ${r.missing.join("\n  - ")}`,
    );
  }
  if (r.extra.length) {
    console.error(
      `check:i18n-missing-keys: ${r.label} extra vs en:\n  - ${r.extra.join("\n  - ")}`,
    );
  }
}

const locales = [
  ["en", enDict],
  ["fr", frDict],
  ["es", esDict],
];

for (const [loc, dict] of locales) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== "string") continue;
    const icuErr = validateIcu(value);
    if (icuErr) {
      failed = true;
      console.error(
        `check:i18n-missing-keys: ${loc} ICU invalid «${key}»: ${icuErr}`,
      );
    }
    if (loc === "en") continue;
    const enVal = enDict[key];
    if (typeof enVal !== "string") continue;
    const enPh = simplePlaceholders(enVal);
    const locPh = simplePlaceholders(value);
    const missingPh = [...enPh].filter((p) => !locPh.has(p)).sort();
    const extraPh = [...locPh].filter((p) => !enPh.has(p)).sort();
    if (missingPh.length || extraPh.length) {
      failed = true;
      console.error(
        `check:i18n-missing-keys: ${loc} placeholders «${key}» vs en` +
          (missingPh.length ? ` missing=${missingPh.join(",")}` : "") +
          (extraPh.length ? ` extra=${extraPh.join(",")}` : ""),
      );
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(`check:i18n-missing-keys: all locales match en (${en.size} keys)`);
process.exit(0);
