/**
 * AC3-L3: scan apps/web/src for visible string literals outside locale JSON.
 * Covers JSX text nodes and aria-label / title / placeholder / alt literals.
 *
 * Also scans packages/core domain sources for user-visible labels/reasons that
 * must stay as stable codes (not EN/ES/FR prose) so the web can translate.
 *
 * Allowlist entries must include a reason comment (non-visible / brand / technical).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = resolve(root, "apps/web/src");
const coreDomainRoot = resolve(root, "packages/core/src/domain");

const SKIP_DIRS = new Set(["i18n/locales", "test"]);

const SKIP_FILE_RE = /\.test\.(ts|tsx)$/;

/**
 * Allowlisted exact literals (file relative to apps/web/src).
 * reason: why this is not visible UI copy.
 */
const ALLOWLIST = [
  // Brand — product name in chrome
  { file: "App.tsx", literal: "Relay", reason: "brand name" },
  // IANA example in provisional settings timezone field
  {
    file: "components/SettingsPanel.tsx",
    literal: "Europe/Paris",
    reason: "IANA timezone example placeholder, not UI copy",
  },
];

/** Core files that emit group labels / recommend reasons to the UI. */
const CORE_UI_STRING_FILES = [
  "recommend.ts",
  "date_groups.ts",
  "inbox_query.ts",
];

/**
 * Banned user-visible prose in core→UI payloads (EN group headers, ES reasons).
 * Stable codes like "today" / "rec.blocked" are fine.
 */
const CORE_PROSE_RE =
  /\b(Today|Tomorrow|Yesterday|Overdue|Later|This week|No date|Te espera|Atascado|Venció|Vence |Aviso en|Sin avances|hoy a las|mañana)\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(srcRoot, abs).replaceAll("\\", "/");
    if (statSync(abs).isDirectory()) {
      if (
        SKIP_DIRS.has(rel) ||
        [...SKIP_DIRS].some((d) => rel.startsWith(`${d}/`))
      ) {
        continue;
      }
      walk(abs, out);
      continue;
    }
    if (!/\.(tsx|jsx)$/.test(name)) continue;
    if (SKIP_FILE_RE.test(rel)) continue;
    out.push({ abs, rel });
  }
  return out;
}

function isAllowlisted(rel, literal) {
  return ALLOWLIST.some((a) => a.file === rel && a.literal === literal);
}

/** Strip line + block comments so we don't flag commented examples. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Visible attribute literals: aria-label="…" / title={"…"} / placeholder='…' / alt="…"
 * Skips t("…") expressions.
 */
const ATTR_RE =
  /\b(?:aria-label|title|placeholder|alt)\s*=\s*(?:\{\s*)?(["'])([^"'\\]*(?:\\.[^"'\\]*)*)\1/g;

/**
 * JSX text between tags on a single line, e.g. <span>Hello</span>
 * Avoids TypeScript generics by requiring whitespace or letters typical of prose
 * and rejecting captures that look like code (parens, equals, keywords).
 */
const JSX_LINE_RE =
  />\s*([A-Za-zÀ-ÿ¿¡][^<>{}\n]*?[A-Za-zÀ-ÿ0-9.!?…»«%])\s*</g;

const CODEISH =
  /\b(useState|useRef|useMemo|useEffect|useCallback|const|let|var|return|import|export|typeof|Promise|Record|Partial|Readonly|Map|Set|void|null|undefined)\b|[=();]|=>|\.\.\./;

const hits = [];

for (const { abs, rel } of walk(srcRoot)) {
  const text = stripComments(readFileSync(abs, "utf8"));

  for (const m of text.matchAll(ATTR_RE)) {
    const literal = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!literal.trim()) continue;
    if (isAllowlisted(rel, literal)) continue;
    // Technical-only values
    if (/^(https?:|\/|#|[a-z]+(?:-[a-z0-9]+)+)$/i.test(literal)) continue;
    hits.push({ rel, kind: "attr", literal });
  }

  for (const line of text.split("\n")) {
    // Skip pure TS lines without JSX tags
    if (!line.includes("<") || !line.includes(">")) continue;
    for (const m of line.matchAll(JSX_LINE_RE)) {
      const literal = m[1].trim();
      if (literal.length < 2) continue;
      if (CODEISH.test(literal)) continue;
      if (/^[a-z][a-zA-Z0-9]*$/.test(literal)) continue; // camelCase id
      if (isAllowlisted(rel, literal)) continue;
      hits.push({ rel, kind: "jsx", literal });
    }
  }
}

// Core domain: catch EN/ES prose in labels / reasons destined for the UI.
for (const name of CORE_UI_STRING_FILES) {
  const abs = join(coreDomainRoot, name);
  let text;
  try {
    text = stripComments(readFileSync(abs, "utf8"));
  } catch {
    continue;
  }
  const rel = `packages/core/src/domain/${name}`;
  for (const line of text.split("\n")) {
    // String literals containing banned prose
    for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      const literal = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (!CORE_PROSE_RE.test(literal)) continue;
      hits.push({ rel, kind: "core-prose", literal });
    }
  }
}

// Dedupe
const seen = new Set();
const unique = [];
for (const h of hits) {
  const k = `${h.rel}|${h.kind}|${h.literal}`;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(h);
}

if (unique.length === 0) {
  console.log("check:hardcoded-strings: 0 hits");
  process.exit(0);
}

console.error(`check:hardcoded-strings: ${unique.length} hit(s):`);
for (const h of unique) {
  console.error(`  ${h.rel} [${h.kind}] ${JSON.stringify(h.literal)}`);
}
process.exit(1);
