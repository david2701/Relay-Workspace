/**
 * AC3-L2: fail if fr or es has fewer/more keys than en (source of truth).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "apps/web/src/i18n/locales");

function loadKeys(locale) {
  const raw = JSON.parse(readFileSync(resolve(dir, `${locale}.json`), "utf8"));
  return new Set(Object.keys(raw));
}

const en = loadKeys("en");
const fr = loadKeys("fr");
const es = loadKeys("es");

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

if (failed) {
  process.exit(1);
}
console.log(`check:i18n-missing-keys: all locales match en (${en.size} keys)`);
process.exit(0);
