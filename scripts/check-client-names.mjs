/**
 * AC3-D2 — denylist of real client / person names in seed data and
 * user-visible UI strings (locale JSON + apps/web JSX/TSX copy).
 *
 * Scope (only these paths):
 *   - apps/server/scripts/seed*.ts, ac3_demo.ts
 *   - apps/web/src/i18n/locales/*.json
 *   - apps/web/src TSX/JSX (JSX text + aria-label/title/placeholder/alt)
 *
 * Out of scope (do not flag):
 *   - code identifiers (sync_cursor, cursor pagination, CSS cursors)
 *   - MCP / docs mentioning verified clients (Claude, Cursor as products)
 *   - unit-test fixtures unless they live under the paths above
 *   - comments
 *
 * Denylist (case-insensitive whole-phrase / whole-word as noted):
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Phrases first (longer), then single tokens. */
const DENY_PHRASES = [
  "Grok Bot",
  "Dev Senior",
  "UI/UX Designer",
];

/**
 * Proper names are case-sensitive so code like `cursor` / `syncCursorRef`
 * does not trip the gate. Ids stay case-insensitive.
 */
const DENY_WORDS_CASED = ["David", "Claude", "Cursor", "Acme"];
const DENY_IDS = ["grok-bot", "dev-senior"];

function walkFiles(dir, pred, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "test") continue;
      walkFiles(abs, pred, out);
    } else if (pred(abs)) {
      out.push(abs);
    }
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function collectTargets() {
  const targets = [];
  for (const rel of [
    "apps/server/src/seed/demo_seed.ts",
    "apps/server/scripts/seed.ts",
    "apps/server/scripts/seed_large.ts",
    "apps/server/scripts/ac3_demo.ts",
  ]) {
    targets.push({ abs: resolve(root, rel), kind: "seed" });
  }
  for (const abs of walkFiles(
    resolve(root, "apps/web/src/i18n/locales"),
    (p) => p.endsWith(".json"),
  )) {
    targets.push({ abs, kind: "locale" });
  }
  for (const abs of walkFiles(
    resolve(root, "apps/web/src"),
    (p) => /\.(tsx|jsx)$/.test(p) && !p.includes("/i18n/locales/"),
  )) {
    targets.push({ abs, kind: "ui" });
  }
  return targets;
}

function extractUiHaystack(src) {
  const clean = stripComments(src);
  const chunks = [];
  const attrRe =
    /\b(?:aria-label|title|placeholder|alt)\s*=\s*(?:\{\s*)?(["'])([^"'\\]*(?:\\.[^"'\\]*)*)\1/g;
  let m;
  while ((m = attrRe.exec(clean))) chunks.push(m[2]);
  const jsxRe = />\s*([^<>{}\n]+?)\s*</g;
  while ((m = jsxRe.exec(clean))) {
    const t = m[1].trim();
    if (t && /[A-Za-zÀ-ÿ]/.test(t)) chunks.push(t);
  }
  // String literals that look like visible copy (quoted phrases with spaces)
  const strRe = /(["'])([^"'\\]{3,}(?:\\.[^"'\\]*)*)\1/g;
  while ((m = strRe.exec(clean))) {
    const t = m[2];
    if (/\s/.test(t) && /[A-Za-z]/.test(t)) chunks.push(t);
  }
  return chunks.join("\n");
}

function findHits(text) {
  const hits = [];
  for (const phrase of DENY_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(text)) hits.push(phrase);
  }
  for (const word of DENY_WORDS_CASED) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(text)) hits.push(word);
  }
  for (const word of DENY_IDS) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) hits.push(word);
  }
  return hits;
}

const targets = collectTargets();
const failures = [];

for (const { abs, kind } of targets) {
  const rel = relative(root, abs);
  let haystack;
  if (kind === "locale" || kind === "seed") {
    haystack = readFileSync(abs, "utf8");
    if (kind === "seed") haystack = stripComments(haystack);
  } else {
    haystack = extractUiHaystack(readFileSync(abs, "utf8"));
  }
  const hits = findHits(haystack);
  if (hits.length) {
    failures.push({ rel, kind, hits: [...new Set(hits)] });
  }
}

if (failures.length) {
  console.error("check:client-names FAILED — denylist hits:\n");
  for (const f of failures) {
    console.error(`  ${f.rel} (${f.kind}): ${f.hits.join(", ")}`);
  }
  console.error(
    "\nDenylist: " +
      [...DENY_PHRASES, ...DENY_WORDS_CASED, ...DENY_IDS].join(", ") +
      "\nScope: seed scripts, locale JSON, apps/web visible UI strings." +
      "\nProper names are case-sensitive; code ids like sync_cursor are ignored.",
  );
  process.exit(1);
}

console.log(
  `check:client-names OK — 0 hits in ${targets.length} files (seed + locales + UI).`,
);
