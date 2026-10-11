import { expect, test, E2E_API } from "./fixtures";
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expectHechosOnlyTerminal,
  expectNoDuplicateTitles,
  expectRailMatchesTeNecesita,
  expectSectionCountsMatch,
  waitInboxView,
} from "./helpers";

const API = E2E_API;
const ART = "/opt/cursor/artifacts";
const SLA_MS = 2000;

type Stamp = { label: string; tMs: number };

async function reseedCleanDemo(): Promise<void> {
  // Prefer HTTP e2e-reset so the live SSE hub drops clients and resyncs seq
  // (CLI seed on the same file would rewind item_events without notifying the hub).
  const res = await fetch(`${API}/api/store/e2e-reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale: "en" }),
  });
  if (!res.ok) {
    throw new Error(`e2e-reset failed: ${res.status} ${await res.text()}`);
  }
}

async function mcp(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/mcp/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Actor": "agent-code",
      "X-Relay-Source": "mcp",
    },
    body: JSON.stringify({
      name,
      arguments: { ...args, actor: { id: "agent-code", type: "agent" } },
    }),
  });
  const json = (await res.json()) as {
    result?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.result ?? {};
}

test.use({
  video: { mode: "on", size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});

test("AC3 paced loop on clean seed", async ({ page }) => {
  // Video capture + paced waits can exceed the default 60s once teardown encodes.
  test.setTimeout(120_000);
  mkdirSync(ART, { recursive: true });
  await reseedCleanDemo();
  const stamps: Stamp[] = [];
  const t0 = Date.now();
  const mark = (label: string) => {
    stamps.push({ label, tMs: Date.now() - t0 });
  };

  await page.goto("/");
  await page.waitForTimeout(500);
  mark("start Atención seed");

  // —— (a) Stay on Con agentes: assigned → in_progress → done ——
  await page.getByRole("button", { name: /Con agentes/ }).click();
  await waitInboxView(page, "agent_wip");
  mark("Con agentes");
  await expect(
    page.locator('.rail button:has-text("Con agentes") .rail-count'),
  ).toHaveCount(0);

  const created = (await mcp("items_create", {
    title: "Cerrar borrador del post de lanzamiento",
    goal: "Borrador listo para revisión",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "agent-code" });
  const row = page.getByRole("option", {
    name: new RegExp(created.item.title),
  });
  await expect(row).toBeVisible({ timeout: SLA_MS });
  await expect(row).toHaveCount(1);
  mark("assigned visible");
  await page.waitForTimeout(1800);

  await mcp("items_set_status", { id: created.item.id, status: "in_progress" });
  await expect(row).toBeVisible({ timeout: SLA_MS });
  await expect(row.locator(".actor-mark")).toHaveAttribute("data-shape", "square");
  mark("in_progress visible");
  await page.waitForTimeout(1800);

  await mcp("items_complete", { id: created.item.id });
  await expect(row).toHaveCount(1, { timeout: SLA_MS });
  mark("complete linger");
  await page.waitForTimeout(1800);

  await page.getByRole("button", { name: /^Hechos$/ }).click();
  await waitInboxView(page, "done");
  await expectNoDuplicateTitles(page, created.item.title);
  await expect(page.getByText(/Completado por Code agent/i).first()).toBeVisible();
  await expectHechosOnlyTerminal(page);
  mark("Hechos");
  await page.waitForTimeout(1400);

  // —— (b) Atención: blocked arrives live in Atascado ——
  await page.getByRole("button", { name: /Atención/ }).click();
  await waitInboxView(page, "attention");
  mark("Atención");
  await expectSectionCountsMatch(page);
  await expectRailMatchesTeNecesita(page);

  const blocked = (await mcp("items_create", {
    title: "Publicar build en staging",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: blocked.item.id, agent_id: "agent-code" });
  await mcp("items_set_status", {
    id: blocked.item.id,
    status: "blocked",
    blocked_reason: "staging caído",
  });
  const blockedRow = page
    .getByRole("group", { name: /Atascado/ })
    .getByRole("option", { name: new RegExp(blocked.item.title) });
  await expect(blockedRow).toBeVisible({ timeout: SLA_MS });
  await expectNoDuplicateTitles(page, blocked.item.title);
  await expectSectionCountsMatch(page);
  mark("blocked in Atascado (counts match)");
  await page.waitForTimeout(1400);

  // —— (c) ask_user live → open → type → Devolver → agent view ——
  const ask = (await mcp("items_create", {
    title: "Revisar copy del correo de lanzamiento",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: ask.item.id, agent_id: "agent-code" });
  await mcp("items_ask_user", {
    id: ask.item.id,
    reason: "¿Publico A o B?",
  });
  const askRow = page
    .getByRole("group", { name: /Te necesita/ })
    .getByRole("option", { name: new RegExp(ask.item.title) });
  await expect(askRow).toBeVisible({ timeout: SLA_MS });
  await expectNoDuplicateTitles(page, ask.item.title);
  await expectSectionCountsMatch(page);
  await expectRailMatchesTeNecesita(page);
  mark("needs_you in Te necesita (counts + rail match)");
  await page.waitForTimeout(900);

  await askRow.click();
  const banner = page.locator(".reason-banner.needs_you");
  await expect(banner).toBeVisible();
  await expect(banner.locator("textarea")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Devolver a Code agent/ }),
  ).toBeVisible();
  mark("detail needs_you open");
  await page.waitForTimeout(600);
  await banner.locator("textarea").fill("Publica la opción A.");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Devolver a Code agent/ }).click();
  await expect(page.getByText(/Decisión:/i).first()).toBeVisible({
    timeout: SLA_MS,
  });
  mark("decisión note created");
  await page.waitForTimeout(700);

  // V4 — open agent view and hold so the frame shows «Lo que ve el agente»
  // with the decisión note (not only NOTAS).
  await page.getByRole("button", { name: /Lo que ve el agente/ }).click();
  const agentView = page.locator(".agent-view");
  await expect(agentView).toBeVisible({ timeout: SLA_MS });
  await expect(agentView.locator("h1")).toBeVisible();
  await expect(agentView.getByText(/Publica la opción A/)).toBeVisible({
    timeout: SLA_MS,
  });
  await expect(agentView.getByText(/\[decision\]|Decisión/i).first()).toBeVisible();
  // Hold long enough for the recording to capture the full agent-view frame.
  mark("Lo que ve el agente + decisión");
  await page.waitForTimeout(2400);
  mark("end");

  writeFileSync(
    resolve(ART, "ac3-loop-timestamps.json"),
    JSON.stringify({ stamps, totalMs: Date.now() - t0 }, null, 2),
  );

});

test.afterEach(async ({}, testInfo) => {
  // Video path is only finalized after the test body; copy from attachments
  // and fall back to the Playwright test-results folder.
  for (const a of testInfo.attachments) {
    if (a.name === "video" && a.path && existsSync(a.path)) {
      copyFileSync(a.path, resolve(ART, "ac3-loop-recording.webm"));
      return;
    }
  }
  const fallback = resolve(
    import.meta.dirname,
    "../test-results/ac3_recording-AC3-paced-loop-on-clean-seed/video.webm",
  );
  if (existsSync(fallback)) {
    copyFileSync(fallback, resolve(ART, "ac3-loop-recording.webm"));
  }
});
