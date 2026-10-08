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
  // Web client first page + incremental steady state.
  const first = await timedFetch(`${API}/api/inbox?view=attention&limit=50`);
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
    second = await timedFetch(`${API}/api/inbox?view=attention&limit=50`);
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

  const apiAttentionFull = await measureApi("/api/inbox?view=attention");
  const apiAttentionPage = await measureApi(
    "/api/inbox?view=attention&limit=50",
  );
  const apiAllFull = await measureApi("/api/inbox?view=all");
  const apiAllPage = await measureApi("/api/inbox?view=all&limit=50").catch(
    () => null,
  );
  const mcpInbox = await measureMcpInbox();
  const poll = await measurePollPayload();

  let uiAttention = null;
  let uiAll = null;
  let scrollAttention = null;
  let scrollAll = null;
  const browser = await chromium.launch({ headless: true });
  try {
    const pageAtt = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    uiAttention = await measureUi(pageAtt, "Atención", "attention");
    scrollAttention = await measureWheelScroll(pageAtt, "Atención", "attention");
    await pageAtt.close();
    const pageAll = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    uiAll = await measureUi(pageAll, "Todo", "all");
    scrollAll = await measureWheelScroll(pageAll, "Todo", "all");
    await pageAll.close();
  } catch (err) {
    console.warn(
      "UI measurement failed (baseline may be too heavy):",
      err.message ?? err,
    );
  } finally {
    await browser.close();
  }

  const result = {
    phase: PHASE,
    measured_at: new Date().toISOString(),
    item_total_hint: itemTotal,
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
