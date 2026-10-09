#!/usr/bin/env node
/**
 * contrast-matrix.mjs — verify Relay tokens.css against specs §3.2 thresholds.
 * Exit 0 only if all required pairs pass for :root and .dark.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath =
  process.argv[2] ?? resolve(__dirname, "../apps/web/src/styles/tokens.css");

function parseBlock(css, selector) {
  const re =
    selector === ":root"
      ? /:root\s*\{([\s\S]*?)\n\}/
      : /\.dark\s*\{([\s\S]*?)\n\}/;
  const m = css.match(re);
  if (!m) throw new Error(`Block not found: ${selector}`);
  const vars = {};
  const reVar = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let vm;
  while ((vm = reVar.exec(m[1])) !== null) {
    vars[vm[1]] = vm[2].trim();
  }
  return vars;
}

function resolveColor(vars, name, depth = 0) {
  if (depth > 5) throw new Error(`Cycle resolving ${name}`);
  const v = vars[name];
  if (!v) throw new Error(`Missing --${name}`);
  if (v.startsWith("var(--") && v.endsWith(")")) {
    const inner = v.slice(6, -1).replace(/^--/, "");
    return resolveColor(vars, inner, depth + 1);
  }
  return v;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) throw new Error(`Unsupported color: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function channel(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pairs from specs §3.2 that must meet thresholds */
const PAIRS = [
  ["ink", "paper", 4.5],
  ["ink", "raised", 4.5],
  ["ink", "sunken", 4.5],
  ["ink", "accent-tint", 4.5],
  ["ink-2", "paper", 4.5],
  ["ink-2", "raised", 4.5],
  ["ink-2", "accent-tint", 4.5],
  ["ink-muted", "paper", 4.5],
  ["ink-muted", "raised", 4.5],
  ["ink-muted", "sunken", 4.5],
  ["ink-muted", "accent-tint", 4.5],
  ["accent-ink", "paper", 4.5],
  ["accent-ink", "raised", 4.5],
  ["accent-ink", "accent-tint", 4.5],
  ["on-accent", "accent", 4.5],
  ["ok", "paper", 4.5],
  ["ok", "sunken", 4.5],
  ["warn", "paper", 4.5],
  ["warn", "sunken", 4.5],
  ["crit", "paper", 4.5],
  ["crit", "raised", 4.5],
  ["crit", "sunken", 4.5],
  ["crit", "accent-tint", 4.5],
  ["attention-rule", "raised", 3.0],
  ["focus", "paper", 3.0],
  ["focus", "raised", 3.0],
  ["control", "paper", 3.0],
  ["control", "raised", 3.0],
  // v1.2 §0.3 — match highlight
  ["ink", "mark-bg", 7.0],
  ["ink-2", "mark-bg", 4.5],
];

function checkMode(label, vars) {
  const failures = [];
  for (const [fg, bg, min] of PAIRS) {
    const fgHex = resolveColor(vars, fg);
    const bgHex = resolveColor(vars, bg);
    const ratio = contrast(fgHex, bgHex);
    const ok = ratio + 1e-9 >= min;
    const line = `${label} ${fg}/${bg}: ${ratio.toFixed(2)} (min ${min}) ${ok ? "OK" : "FAIL"}`;
    console.info(line);
    if (!ok) failures.push(line);
  }
  return failures;
}

const css = readFileSync(tokensPath, "utf8");
const root = parseBlock(css, ":root");
const darkOverrides = parseBlock(css, ".dark");
// .dark inherits unspecified vars from :root (e.g. --attention-rule)
const dark = { ...root, ...darkOverrides };
const failures = [...checkMode(":root", root), ...checkMode(".dark", dark)];
if (failures.length) {
  console.error(`\n${failures.length} contrast failure(s)`);
  process.exit(1);
}
console.info("\ncontrast-matrix: all pairs pass");
process.exit(0);
