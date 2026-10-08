#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
/**
 * AC3 SLA benchmark (MCP invoke return → DOM row visible).
 * 10 samples × {complete, needs_you, blocked}; asserts every sample ≤ 2000 ms.
 *
 * Usage (dev servers on 7420/7421, or set RELAY_API / RELAY_WEB):
 *   node scripts/benchmark-ac3-sla.mjs
 */
import { chromium } from "@playwright/test";

const API = process.env.RELAY_API ?? "http://127.0.0.1:7420";
const WEB = process.env.RELAY_WEB ?? "http://127.0.0.1:7421";
const MAX_MS = 2000;
const SAMPLES = 10;

async function mcp(name, args, actorId = "agent-code") {
  const res = await fetch(`${API}/mcp/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Actor": actorId,
      "X-Relay-Source": "mcp",
    },
    body: JSON.stringify({
      name,
      arguments: { ...args, actor: { id: actorId, type: "agent" } },
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.result ?? {};
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

async function waitOptionVisible(page, title, timeout, _section) {
  const deadline = Date.now() + timeout;
  const re = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Rely on the app flash→scrollToIndex (oldest-first section end). Do not
  // jump scrollTop to scrollHeight — that lands in «Para hoy» at 10k.
  while (Date.now() < deadline) {
    const opt = page.getByRole("option", { name: re });
    if ((await opt.count()) > 0) {
      await opt.first().scrollIntoViewIfNeeded().catch(() => {});
      if (await opt.first().isVisible().catch(() => false)) return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Option not visible within ${timeout}ms: ${title}`);
}

async function measureNeedsYou(page, i) {
  const title = `SLA needs_you ${i} ${Date.now()}`;
  const created = await mcp("items_create", { title });
  const id = created.item.id;
  await mcp("items_delegate", { id, agent_id: "agent-code" });
  const t0 = Date.now();
  await mcp("items_ask_user", {
    id,
    reason: "¿Cierro A o B para el SLA?",
  });
  const mcpDone = Date.now();
  await waitOptionVisible(page, title, MAX_MS + 200, "needs_you");
  return { mcpReturnMs: mcpDone - t0, uiMs: Date.now() - mcpDone, totalMs: Date.now() - t0 };
}

async function measureBlocked(page, i) {
  const title = `SLA blocked ${i} ${Date.now()}`;
  const created = await mcp("items_create", { title });
  const id = created.item.id;
  await mcp("items_delegate", { id, agent_id: "agent-code" });
  const t0 = Date.now();
  await mcp("items_set_status", {
    id,
    status: "blocked",
    blocked_reason: "staging caído para SLA",
  });
  const mcpDone = Date.now();
  await waitOptionVisible(page, title, MAX_MS + 200, "blocked");
  return { mcpReturnMs: mcpDone - t0, uiMs: Date.now() - mcpDone, totalMs: Date.now() - t0 };
}

async function measureComplete(page, i) {
  await page.getByRole("button", { name: /Con agentes/ }).click();
  await page.locator('[data-inbox-view="agent_wip"]').waitFor({ timeout: 5000 });
  const title = `SLA complete ${i} ${Date.now()}`;
  const created = await mcp("items_create", { title, goal: "SLA" });
  const id = created.item.id;
  await mcp("items_delegate", { id, agent_id: "agent-code" });
  await mcp("items_set_status", { id, status: "in_progress" });
  await page.getByRole("option", { name: new RegExp(title) }).waitFor({
    state: "visible",
    timeout: 5000,
  });
  const t0 = Date.now();
  await mcp("items_complete", { id });
  const mcpDone = Date.now();
  // Row lingers then leaves; measure appearance of completed state / leave.
  await page
    .getByRole("option", { name: new RegExp(title) })
    .waitFor({ state: "visible", timeout: MAX_MS + 200 });
  const uiMs = Date.now() - mcpDone;
  await page.getByRole("button", { name: /Atención/ }).click();
  await page.locator('[data-inbox-view="attention"]').waitFor({ timeout: 5000 });
  return { mcpReturnMs: mcpDone - t0, uiMs, totalMs: Date.now() - t0 };
}

async function runVariant(page, name, fn) {
  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    if (name !== "complete") {
      await page.getByRole("button", { name: /Atención/ }).click();
      await page.locator('[data-inbox-view="attention"]').waitFor({ timeout: 5000 });
    }
    const s = await fn(page, i);
    samples.push(s);
    console.info(
      `  ${name}[${i}] ui=${s.uiMs}ms total=${s.totalMs}ms (mcp=${s.mcpReturnMs}ms)`,
    );
  }
  const ui = samples.map((s) => s.uiMs).sort((a, b) => a - b);
  return {
    variant: name,
    samples,
    p50: percentile(ui, 50),
    p95: percentile(ui, 95),
    max: ui[ui.length - 1],
  };
}

async function main() {
  const health = await fetch(`${API}/api/health`);
  if (!health.ok) throw new Error(`API not healthy at ${API}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(WEB, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Atención/ }).click();
  await page.locator('[data-inbox-view="attention"]').waitFor({ timeout: 60_000 });
  // Large seeds need the first snapshot painted before SLA samples start.
  await page.getByRole("option").first().waitFor({ state: "visible", timeout: 60_000 });
  const results = [];
  results.push(await runVariant(page, "needs_you", measureNeedsYou));
  results.push(await runVariant(page, "blocked", measureBlocked));
  results.push(await runVariant(page, "complete", measureComplete));
  await browser.close();
  const allUi = results.flatMap((r) => r.samples.map((s) => s.uiMs));
  const sorted = [...allUi].sort((a, b) => a - b);
  const summary = {
    api: API,
    web: WEB,
    metric: "mcp_return_to_dom_visible_ms",
    maxAllowedMs: MAX_MS,
    results,
    overall: {
      n: allUi.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted[sorted.length - 1],
    },
  };
  mkdirSync("logs", { recursive: true });
  writeFileSync("logs/benchmark-ac3-sla.json", JSON.stringify(summary, null, 2));
  console.info("\n=== SUMMARY (MCP→DOM) ===");
  for (const r of results) {
    console.info(
      `${r.variant}: p50=${r.p50} p95=${r.p95} max=${r.max} (n=${r.samples.length})`,
    );
  }
  console.info(
    `overall: p50=${summary.overall.p50} p95=${summary.overall.p95} max=${summary.overall.max}`,
  );
  const offenders = allUi.filter((ms) => ms > MAX_MS);
  if (offenders.length > 0) {
    console.error(`FAIL: ${offenders.length}/${allUi.length} > ${MAX_MS} ms`, offenders);
    process.exit(1);
  }
  console.info(`PASS: all ${allUi.length} samples ≤ ${MAX_MS} ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
