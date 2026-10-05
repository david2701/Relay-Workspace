import { expect, test } from "@playwright/test";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

test("AC3 loop recording complete → blocked → ask_user + reply", async ({
  page,
}, testInfo) => {
  mkdirSync(ART, { recursive: true });
  await page.goto("/");

  // (a) Con agentes → in_progress → done → Hechos «Completado por Grok Bot»
  await page.getByRole("button", { name: /Con agentes/ }).click();
  await page.waitForTimeout(400);
  const stamp = Date.now().toString(36);
  const created = (await mcp("items_create", {
    title: `Cerrar borrador del post de Acme ${stamp}`,
    goal: "Grabación AC3",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", { id: created.item.id, status: "in_progress" });
  await expect(page.getByText(created.item.title).first()).toBeVisible({
    timeout: 4000,
  });
  await page.waitForTimeout(800);
  await mcp("items_complete", { id: created.item.id });
  await expect(
    page.getByRole("option", { name: new RegExp(created.item.title) }),
  ).toHaveCount(1, { timeout: 4000 });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^Hechos$/ }).click();
  await expect(
    page.getByRole("option", { name: new RegExp(created.item.title) }),
  ).toHaveCount(1, { timeout: 4000 });
  await expect(page.getByText(/Completado por Grok Bot/i).first()).toBeVisible();
  await page.waitForTimeout(700);

  // (b) blocked → Atención › Atascado within 2s
  await page.getByRole("button", { name: /Atención/ }).click();
  const blocked = (await mcp("items_create", {
    title: `Publicar build en staging ${stamp}`,
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: blocked.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", {
    id: blocked.item.id,
    status: "blocked",
    blocked_reason: "staging caído",
  });
  await expect(
    page.getByRole("option", { name: new RegExp(blocked.item.title) }),
  ).toBeVisible({ timeout: 4000 });
  await expect(page.getByText(/Atascado: staging caído/)).toBeVisible();
  await page.waitForTimeout(700);

  // (c) ask_user → Te necesita → David replies → decision note in agent view
  const ask = (await mcp("items_create", {
    title: `Revisar copy del correo de lanzamiento ${stamp}`,
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: ask.item.id, agent_id: "grok-bot" });
  await mcp("items_ask_user", {
    id: ask.item.id,
    reason: "¿Publico A o B?",
  });
  const askRow = page.getByRole("option", { name: new RegExp(ask.item.title) });
  await expect(askRow).toBeVisible({ timeout: 4000 });
  await askRow.click();
  await page.waitForTimeout(400);
  await page.locator(".reason-banner textarea").fill("Publica la opción A.");
  await page.getByRole("button", { name: /Devolver a Grok Bot/ }).click();
  await expect(page.getByText(/Decisión:/i).first()).toBeVisible({
    timeout: 4000,
  });
  await page.getByRole("button", { name: /Lo que ve el agente/ }).click();
  await expect(page.getByText(/Publica la opción A/)).toBeVisible({
    timeout: 4000,
  });
  await page.waitForTimeout(1000);

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
