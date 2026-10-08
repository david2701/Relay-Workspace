#!/usr/bin/env node
/**
 * 10k-item performance benchmark for Relay.
 *
 * Measures API/MCP latency, poll payload size, Atención/Todo initial load,
 * and scripted scroll FPS via Playwright + rAF sampling.
 *
 * UI Todo/Atención timings use a **cold browser cache** (CDP Network cache
 * disabled + fresh context) and the same timing points as QA ronda 2:
 *   t0 = click on rail nav → to_first_row = first option visible
 *   to_interactive = list focused + first row clicked
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
  // Web client first page + incremental steady state (Atención window = 200).
  const first = await timedFetch(`${API}/api/inbox?view=attention&limit=200`);
  const syncCursor =
    first.json.sync_cursor ??
    first.json.server_time ??
    first.json.items?.[0]?.updated_at;
  let second;
  if (syncCursor) {
    second = await timedFetch(
      `${API}/api/inbox?view=attention&since=${encodeURIComponent(syncCursor)}`,
    );
  } else {
    second = await timedFetch(`${API}/api/inbox?view=attention&limit=200`);
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

/**
 * Cold-cache UI timing (QA ronda-2 aligned).
 * Fresh context, HTTP cache disabled, no prior view warm-up of the target.
 * Timer starts at the rail click (same as QA `measureUi`).
 */
async function measureUiCold(browser, viewLabel, viewKey) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });

  // Land on a different view first so the measured click always fetches fresh.
  const landView = viewKey === "attention" ? "all" : "attention";
  const landLabel = viewKey === "attention" ? "Todo" : "Atención";
  const landPath = landView === "all" ? "/all" : "/attention";
  await page.goto(`${WEB}${landPath}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await navButton(page, landLabel).waitFor({ state: "visible", timeout: 120_000 });
  await page
    .locator('.item-list [role="option"], .item-list .empty')
    .first()
    .waitFor({ state: "visible", timeout: 180_000 });
  await page.locator(`[data-inbox-view="${landView}"]`).waitFor({
    state: "visible",
    timeout: 180_000,
  });

  // Hard reload landing view + clear HTTP cache so the target inbox XHR is cold.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page
    .locator('.item-list [role="option"], .item-list .empty')
    .first()
    .waitFor({ state: "visible", timeout: 180_000 });
  await client.send("Network.clearBrowserCache").catch(() => {});

  const t0 = performance.now();
  await navButton(page, viewLabel).click({ timeout: 120_000 });
  await page.locator(`[data-inbox-view="${viewKey}"]`).waitFor({
    state: "visible",
    timeout: 180_000,
  });
  const firstRow = page.getByRole("option").first();
  await firstRow.waitFor({ state: "visible", timeout: 180_000 });
  const toFirstRowMs = performance.now() - t0;
  await page.evaluate(() => {
    const el = document.querySelector(".item-list");
    if (el instanceof HTMLElement) el.focus();
  });
  await firstRow.click({ timeout: 120_000, force: true });
  const toInteractiveMs = performance.now() - t0;

  const result = {
    view: viewKey,
    method: "cold_cache",
    to_first_row_ms: Number(toFirstRowMs.toFixed(2)),
    to_interactive_ms: Number(toInteractiveMs.toFixed(2)),
  };
  await context.close();
  return result;
}

function summarizeFrames(frameTimes) {
  if (frameTimes.length === 0) {
    return {
      frames: 0,
      avg_frame_ms: 0,
      fps: 0,
      p95_frame_ms: 0,
      long_frames_over_16_7ms: 0,
      long_frames_over_32ms: 0,
    };
  }
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const avgDt = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  return {
    frames: frameTimes.length,
    avg_frame_ms: Number(avgDt.toFixed(2)),
    fps: Number((avgDt > 0 ? 1000 / avgDt : 0).toFixed(2)),
    p95_frame_ms: Number(percentile(sorted, 95).toFixed(2)),
    long_frames_over_16_7ms: frameTimes.filter((t) => t > 16.7).length,
    long_frames_over_32ms: frameTimes.filter((t) => t > 32).length,
  };
}

/** Real mouse.wheel scroll + rAF sampling (+ optional CDP metrics). */
async function measureWheelScroll(page, viewLabel, viewKey) {
  await navButton(page, viewLabel).click({ timeout: 120_000 });
  await page.locator(`[data-inbox-view="${viewKey}"]`).waitFor({
    state: "visible",
    timeout: 180_000,
  });
  await page.getByRole("option").first().waitFor({ state: "visible", timeout: 180_000 });
  const list = page.locator(".item-list");
  await list.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(300);

  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable").catch(() => {});

  const box = await list.boundingBox();
  if (!box) throw new Error("item-list has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // Start rAF sampler in page, then wheel in ~100 px steps for a few seconds.
  await page.evaluate(() => {
    const w = window;
    w.__relayFrameTimes = [];
    let last = performance.now();
    const loop = (now) => {
      w.__relayFrameTimes.push(now - last);
      last = now;
      w.__relayRaf = requestAnimationFrame(loop);
    };
    w.__relayRaf = requestAnimationFrame(loop);
  });

  const steps = 40;
  const stepPx = 100;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, stepPx);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(200);

  const frameTimes = await page.evaluate(() => {
    const w = window;
    if (w.__relayRaf) cancelAnimationFrame(w.__relayRaf);
    const times = w.__relayFrameTimes ?? [];
    delete w.__relayFrameTimes;
    delete w.__relayRaf;
    return times;
  });

  let cdp = null;
  try {
    const metrics = await client.send("Performance.getMetrics");
    cdp = Object.fromEntries(metrics.metrics.map((m) => [m.name, m.value]));
  } catch {
    cdp = null;
  }
  await client.detach().catch(() => {});

  return {
    view: viewKey,
    method: "mouse.wheel",
    scroll_distance_px: steps * stepPx,
    ...summarizeFrames(frameTimes),
    cdp_metrics: cdp
      ? {
          LayoutCount: cdp.LayoutCount,
          LayoutDuration: cdp.LayoutDuration,
          RecalcStyleCount: cdp.RecalcStyleCount,
          RecalcStyleDuration: cdp.RecalcStyleDuration,
          ScriptDuration: cdp.ScriptDuration,
        }
      : null,
  };
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

  // UI cold timings first (before API sample loops warm SQLite / process caches).
  let uiAttention = null;
  let uiAll = null;
  let scrollAttention = null;
  let scrollAll = null;
  const browser = await chromium.launch({ headless: true });
  try {
    uiAttention = await measureUiCold(browser, "Atención", "attention");
    uiAll = await measureUiCold(browser, "Todo", "all");

    const pageScroll = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await pageScroll.goto(WEB, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await navButton(pageScroll, "Atención").waitFor({
      state: "visible",
      timeout: 120_000,
    });
    await pageScroll
      .locator('.item-list [role="option"], .item-list .empty')
      .first()
      .waitFor({ state: "visible", timeout: 180_000 });
    scrollAttention = await measureWheelScroll(pageScroll, "Atención", "attention");
    scrollAll = await measureWheelScroll(pageScroll, "Todo", "all");
    await pageScroll.close();
  } catch (err) {
    console.warn(
      "UI measurement failed (baseline may be too heavy):",
      err.message ?? err,
    );
  } finally {
    await browser.close();
  }

  const apiAttentionFull = await measureApi("/api/inbox?view=attention");
  const apiAttentionPage = await measureApi(
    "/api/inbox?view=attention&limit=200",
  );
  const apiAllFull = await measureApi("/api/inbox?view=all");
  const apiAllPage = await measureApi("/api/inbox?view=all&limit=50").catch(
    () => null,
  );
  const mcpInbox = await measureMcpInbox();
  const poll = await measurePollPayload();

  const result = {
    phase: PHASE,
    measured_at: new Date().toISOString(),
    item_total_hint: itemTotal,
    ui_method: "cold_cache",
    api: {
      inbox_attention: apiAttentionFull,
      inbox_attention_page: apiAttentionPage,
      inbox_all: apiAllFull,
      inbox_all_page: apiAllPage,
    },
    mcp: { inbox_query: mcpInbox },
    poll,
    ui: {
      attention: uiAttention,
      all: uiAll,
      scroll_attention: scrollAttention,
      scroll_all: scrollAll,
      // Back-compat alias used by older docs.
      scroll: scrollAll,
    },
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
