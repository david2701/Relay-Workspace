import { expect, test } from "@playwright/test";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  expectHechosOnlyTerminal,
  expectNoDuplicateTitles,
  expectSectionCountsMatch,
  waitInboxView,
} from "./helpers";

const API = "http://127.0.0.1:7430";
const ART = "/opt/cursor/artifacts";

async function mcp(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/mcp/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Actor": "grok-bot",
      "X-Relay-Source": "mcp",
    },
    body: JSON.stringify({
      name,
      arguments: { ...args, actor: { id: "grok-bot", type: "agent" } },
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

test("AC3 paced loop on clean seed", async ({ page }, testInfo) => {
  mkdirSync(ART, { recursive: true });
  await page.goto("/");

  // —— (a) Stay on Con agentes: assigned → in_progress → done ——
  await page.getByRole("button", { name: /Con agentes/ }).click();
  await waitInboxView(page, "agent_wip");
  await expect(
    page.locator('.rail button:has-text("Con agentes") .rail-count'),
  ).toHaveCount(0);

  const created = (await mcp("items_create", {
    title: "Cerrar borrador del post de Acme",
    goal: "Borrador listo para revisión",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  const row = page.getByRole("option", {
    name: new RegExp(created.item.title),
  });
  await expect(row).toBeVisible({ timeout: 4000 });
  await expect(row).toHaveCount(1);
  await page.waitForTimeout(2000);

  await mcp("items_set_status", { id: created.item.id, status: "in_progress" });
  await expect(row).toBeVisible({ timeout: 4000 });
  await expect(row.locator(".actor-mark")).toHaveAttribute("data-shape", "square");
  await page.waitForTimeout(2000);

  await mcp("items_complete", { id: created.item.id });
  await expect(row).toHaveCount(1, { timeout: 4000 });
  await page.waitForTimeout(2000);

  await page.getByRole("button", { name: /^Hechos$/ }).click();
  await waitInboxView(page, "done");
  await expectNoDuplicateTitles(page, created.item.title);
  await expect(page.getByText(/Completado por Grok Bot/i).first()).toBeVisible();
  await expectHechosOnlyTerminal(page);
  await page.waitForTimeout(1500);

  // —— (b) Atención: blocked arrives live in Atascado ——
  await page.getByRole("button", { name: /Atención/ }).click();
  await waitInboxView(page, "attention");
  const blocked = (await mcp("items_create", {
    title: "Publicar build en staging",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: blocked.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", {
    id: blocked.item.id,
    status: "blocked",
    blocked_reason: "staging caído",
  });
  const blockedRow = page
    .getByRole("group", { name: /Atascado/ })
    .getByRole("option", { name: new RegExp(blocked.item.title) });
  await expect(blockedRow).toBeVisible({ timeout: 4000 });
  await expectNoDuplicateTitles(page, blocked.item.title);
  await expectSectionCountsMatch(page);
  await page.waitForTimeout(1500);

  // —— (c) ask_user live → open → type → Devolver → agent view ——
  const ask = (await mcp("items_create", {
    title: "Revisar copy del correo de lanzamiento",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: ask.item.id, agent_id: "grok-bot" });
  await mcp("items_ask_user", {
    id: ask.item.id,
    reason: "¿Publico A o B?",
  });
  const askRow = page
    .getByRole("group", { name: /Te necesita/ })
    .getByRole("option", { name: new RegExp(ask.item.title) });
  await expect(askRow).toBeVisible({ timeout: 4000 });
  await expectNoDuplicateTitles(page, ask.item.title);
  await expectSectionCountsMatch(page);
  await page.waitForTimeout(800);

  await askRow.click();
  const banner = page.locator(".reason-banner.needs_you");
  await expect(banner).toBeVisible();
  await expect(banner.locator("textarea")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Devolver a Grok Bot/ }),
  ).toBeVisible();
  await page.waitForTimeout(600);
  await banner.locator("textarea").fill("Publica la opción A.");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Devolver a Grok Bot/ }).click();
  await expect(page.getByText(/Decisión:/i).first()).toBeVisible({
    timeout: 4000,
  });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Lo que ve el agente/ }).click();
  await expect(
    page.locator(".agent-view").getByText(/Publica la opción A/),
  ).toBeVisible({ timeout: 4000 });
  await page.waitForTimeout(1600);

  const video = testInfo.attachments.find((a) => a.name === "video");
  if (video?.path && existsSync(video.path)) {
    copyFileSync(video.path, resolve(ART, "ac3-loop-recording.webm"));
  }
});

test.afterEach(async ({}, testInfo) => {
  for (const a of testInfo.attachments) {
    if (a.name === "video" && a.path && existsSync(a.path)) {
      copyFileSync(a.path, resolve(ART, "ac3-loop-recording.webm"));
    }
  }
});
