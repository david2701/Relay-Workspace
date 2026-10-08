#!/usr/bin/env node
/**
 * 10k-item performance benchmark for Relay.
 *
 * Measures API/MCP latency, poll payload size, Atención/Todo initial load,
 * and scripted scroll FPS via Playwright + rAF sampling.
 *
 * Usage:
 *   RELAY_PHASE=before|after node scripts/benchmark-large.mjs
 *
 * Expects server on RELAY_API (default :7420) and web on RELAY_WEB (:7421)
 * with the large seed already loaded.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const API = process.env.RELAY_API ?? "http://127.0.0.1:7420";
const WEB = process.env.RELAY_WEB ?? "http://127.0.0.1:7421";
const PHASE = process.env.RELAY_PHASE ?? "after";
const OUT_DIR = resolve("artifacts/perf");
const DOC_JSON = resolve("docs/perf/benchmark-10k.json");

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function timedFetch(url, init) {
  const t0 = performance.now();
  const res = await fetch(url, init);
  const buf = await res.arrayBuffer();
  const ms = performance.now() - t0;
  return { res, bytes: buf.byteLength, ms, json: JSON.parse(new TextDecoder().decode(buf)) };
}

async function measureApi(path, samples = 20) {
  const times = [];
  let lastBytes = 0;
  for (let i = 0; i < samples; i += 1) {
    const { ms, bytes, res } = await timedFetch(`${API}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    times.push(ms);
    lastBytes = bytes;
  }
  return {
    path,
    samples,
    p50_ms: Number(percentile(times, 50).toFixed(2)),
    p95_ms: Number(percentile(times, 95).toFixed(2)),
    mean_ms: Number(mean(times).toFixed(2)),
    payload_bytes: lastBytes,
  };
}

async function measureMcpInbox(samples = 20) {
  const times = [];
  let lastBytes = 0;
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    const res = await fetch(`${API}/mcp/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Actor": "grok-bot",
        "X-Relay-Source": "mcp",
      },
      body: JSON.stringify({
        name: "inbox_query",
        arguments: { view: "attention" },
      }),
    });
    const buf = await res.arrayBuffer();
    const ms = performance.now() - t0;
    const json = JSON.parse(new TextDecoder().decode(buf));
    if (!res.ok || json.error) throw new Error(json.error ?? `MCP HTTP ${res.status}`);
    times.push(ms);
    lastBytes = buf.byteLength;
  }
  return {
    tool: "inbox_query",
    samples,
    p50_ms: Number(percentile(times, 50).toFixed(2)),
    p95_ms: Number(percentile(times, 95).toFixed(2)),
    mean_ms: Number(mean(times).toFixed(2)),
    payload_bytes: lastBytes,
  };
}

async function measurePollPayload() {
  // Steady-state: two consecutive polls. Prefer incremental when available.
  const first = await timedFetch(`${API}/api/inbox?view=attention`);
  const syncCursor =
    first.json.sync_cursor ??
    first.json.server_time ??
    first.json.items?.[0]?.updated_at;
  let second;
  if (syncCursor) {
    second = await timedFetch(
      `${API}/api/inbox?view=attention&since=${encodeURIComponent(syncCursor)}`,
    );
    // If server ignores `since`, payload stays huge — still record it.
  } else {
    second = await timedFetch(`${API}/api/inbox?view=attention`);
  }
  return {
    initial_bytes: first.bytes,
    steady_bytes: second.bytes,
    mode: second.json.mode ?? "snapshot",
  };
}

function navButton(page, label) {
  // Rail labels may include a numeric badge (e.g. "Atención700").
  return page.locator(".rail button").filter({ hasText: new RegExp(`^${label}`) });
}

async function measureUi(page, viewLabel, viewKey) {
  page.setDefaultTimeout(180_000);
  await page.goto(WEB, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await navButton(page, "Atención").waitFor({ state: "visible", timeout: 120_000 });
  // Wait until the first inbox payload paints at least one row (or empty state).
  await page
    .locator('.item-list [role="option"], .item-list .empty')
    .first()
    .waitFor({ state: "visible", timeout: 180_000 });
  // Switch away and back to force a clean load measurement when needed.
  if (viewKey !== "attention") {
    await navButton(page, "Atención").click({ timeout: 120_000 });
    await page.locator('[data-inbox-view="attention"]').waitFor({
      state: "visible",
      timeout: 120_000,
    });
  }
  const t0 = performance.now();
  await navButton(page, viewLabel).click({ timeout: 120_000 });
  await page.locator(`[data-inbox-view="${viewKey}"]`).waitFor({
    state: "visible",
    timeout: 180_000,
  });
  const firstRow = page.getByRole("option").first();
  await firstRow.waitFor({ state: "visible", timeout: 180_000 });
  const toFirstRowMs = performance.now() - t0;
  // Interactive: list accepts focus / click without relying on Playwright focus timeout
  // (huge DOMs on the baseline can stall actionability checks).
  await page.evaluate(() => {
    const el = document.querySelector(".item-list");
    if (el instanceof HTMLElement) el.focus();
  });
  await firstRow.click({ timeout: 120_000, force: true });
  const toInteractiveMs = performance.now() - t0;
  return {
    view: viewKey,
    to_first_row_ms: Number(toFirstRowMs.toFixed(2)),
    to_interactive_ms: Number(toInteractiveMs.toFixed(2)),
  };
}

async function measureScroll(page) {
  await navButton(page, "Todo").click({ timeout: 120_000 });
  await page.locator('[data-inbox-view="all"]').waitFor({ state: "visible", timeout: 180_000 });
  await page.getByRole("option").first().waitFor({ state: "visible", timeout: 180_000 });
  const list = page.locator(".item-list");
  await list.waitFor({ state: "visible", timeout: 60_000 });
  // Give the baseline a moment to finish layout before sampling frames.
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(async () => {
    const el = document.querySelector(".item-list");
    if (!el) throw new Error("missing .item-list");
    const frameTimes = [];
    let last = performance.now();
    let frames = 0;
    const longFrames = [];
    const onFrame = (now) => {
      const dt = now - last;
      last = now;
      frameTimes.push(dt);
      if (dt > 32) longFrames.push(dt);
      frames += 1;
    };
    let raf = requestAnimationFrame(function loop(now) {
      onFrame(now);
      raf = requestAnimationFrame(loop);
    });
    const distance = Math.min(el.scrollHeight, 20_000);
    const step = 400;
    for (let y = 0; y <= distance; y += step) {
      el.scrollTop = y;
      await new Promise((r) => setTimeout(r, 16));
    }
    await new Promise((r) => setTimeout(r, 200));
    cancelAnimationFrame(raf);
    const avgDt =
      frameTimes.length === 0
        ? 0
        : frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = avgDt > 0 ? 1000 / avgDt : 0;
    return {
      frames,
      avg_frame_ms: Number(avgDt.toFixed(2)),
      fps: Number(fps.toFixed(2)),
      long_frames_over_32ms: longFrames.length,
      scroll_distance_px: distance,
    };
  });
  return metrics;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(resolve("docs/perf"), { recursive: true });

  const health = await fetch(`${API}/api/health`);
  if (!health.ok) throw new Error(`API not healthy at ${API}`);

  let itemTotal = null;
  try {
    const counts = await timedFetch(`${API}/api/inbox?view=all&limit=1`);
    itemTotal = counts.json.total_count ?? null;
  } catch {
    itemTotal = null;
  }

  console.info(`Phase=${PHASE} API=${API} WEB=${WEB} items≈${itemTotal ?? "?"}`);

  const apiAttention = await measureApi("/api/inbox?view=attention");
  const apiAll = await measureApi("/api/inbox?view=all");
  const apiAllPage = await measureApi("/api/inbox?view=all&limit=50").catch(() => null);
  const mcpInbox = await measureMcpInbox();
  const poll = await measurePollPayload();

  let uiAttention = null;
  let uiAll = null;
  let scroll = null;
  const browser = await chromium.launch({ headless: true });
  try {
    const pageAtt = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    uiAttention = await measureUi(pageAtt, "Atención", "attention");
    await pageAtt.close();
    const pageAll = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    uiAll = await measureUi(pageAll, "Todo", "all");
    scroll = await measureScroll(pageAll);
    await pageAll.close();
  } catch (err) {
    console.warn("UI measurement failed (baseline may be too heavy):", err.message ?? err);
  } finally {
    await browser.close();
  }

  const result = {
    phase: PHASE,
    measured_at: new Date().toISOString(),
    item_total_hint: itemTotal,
    api: {
      inbox_attention: apiAttention,
      inbox_all: apiAll,
      inbox_all_page: apiAllPage,
    },
    mcp: { inbox_query: mcpInbox },
    poll,
    ui: { attention: uiAttention, all: uiAll, scroll },
  };

  const outFile = resolve(OUT_DIR, `benchmark-10k-${PHASE}.json`);
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.info(`Wrote ${outFile}`);

  // Merge into docs/perf/benchmark-10k.json
  let doc = { before: null, after: null };
  if (existsSync(DOC_JSON)) {
    try {
      doc = JSON.parse(readFileSync(DOC_JSON, "utf8"));
    } catch {
      doc = { before: null, after: null };
    }
  }
  doc[PHASE] = result;
  writeFileSync(DOC_JSON, `${JSON.stringify(doc, null, 2)}\n`);
  console.info(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
