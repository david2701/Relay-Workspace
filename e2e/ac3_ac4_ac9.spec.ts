import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const API = "http://127.0.0.1:7420";
const ART = "/opt/cursor/artifacts";

async function mcp(
  name: string,
  args: Record<string, unknown>,
  actorId = "grok-bot",
): Promise<Record<string, unknown>> {
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
  const json = (await res.json()) as {
    result?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.result ?? {};
}

test.beforeAll(() => {
  mkdirSync(ART, { recursive: true });
});

test("AC9 quick capture creates item from title only", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Todo$/ }).click();
  await page.keyboard.press("n");
  const title = `Captura rápida ${Date.now()}`;
  const input = page.locator("#quick-capture");
  await expect(input).toBeFocused({ timeout: 2000 });
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 5000 });
});

test("AC4 note link and unlink on item detail", async ({ page }) => {
  const created = (await mcp("items_create", {
    title: `Nota link ${Date.now()}`,
  })) as { item: { id: string; title: string } };
  const note = (await mcp("notes_create", {
    title: `Contexto ${Date.now()}`,
    body_md: "Línea de contexto para el agente",
  })) as { note: { id: string; title: string } };

  await page.goto("/");
  await page.getByRole("button", { name: /^Todo$/ }).click();
  await page.getByText(created.item.title, { exact: true }).click();
  await page.getByRole("button", { name: /Vincular nota/i }).click();
  await page.getByPlaceholder(/Busca una nota/).fill(note.note.title);
  await page.getByRole("button", { name: note.note.title, exact: true }).click();
  await expect(
    page.locator(".note-card").getByText(note.note.title, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quitar" }).first().click();
  await expect(page.getByText(/Sin notas/)).toBeVisible();
});

test("AC3 complete via MCP appears in Hechos within 2s", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Con agentes/ }).click();

  const created = (await mcp("items_create", {
    title: `AC3 complete ${Date.now()}`,
    goal: "Visible en Hechos",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", { id: created.item.id, status: "in_progress" });

  await expect(page.getByText(created.item.title).first()).toBeVisible({
    timeout: 4000,
  });

  await mcp("items_complete", { id: created.item.id });
  await page.getByRole("button", { name: /^Hechos$/ }).click();
  await expect(page.getByText(created.item.title).first()).toBeVisible({
    timeout: 4000,
  });
  await expect(page.getByText(/Completado por Grok Bot/i).first()).toBeVisible({
    timeout: 4000,
  });
});

test("AC3 needs_you via MCP appears in Atención within 2s", async ({
  page,
}) => {
  await page.goto("/");
  const created = (await mcp("items_create", {
    title: `AC3 needs_you ${Date.now()}`,
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  await mcp("items_ask_user", {
    id: created.item.id,
    reason: "¿Cierro el PR o espero tu revisión?",
  });

  const row = page.getByRole("option", { name: new RegExp(created.item.title) });
  await expect(row).toBeVisible({ timeout: 4000 });
  await expect(row.getByText(/¿Cierro el PR/)).toBeVisible({ timeout: 4000 });
  await expect(page.locator(".rail-count")).toBeVisible({ timeout: 4000 });
});

test("AC3 blocked via MCP appears in Atascado within 2s", async ({ page }) => {
  await page.goto("/");
  const created = (await mcp("items_create", {
    title: `AC3 blocked ${Date.now()}`,
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", {
    id: created.item.id,
    status: "blocked",
    blocked_reason: "el entorno de staging no responde",
  });

  const row = page.getByRole("option", { name: new RegExp(created.item.title) });
  await expect(row).toBeVisible({ timeout: 4000 });
  await expect(row.getByText(/Atascado: el entorno/)).toBeVisible({
    timeout: 4000,
  });
});

test("AC12 screenshots light and dark", async ({ page }) => {
  test.setTimeout(120_000);
  const titular = (await mcp("items_create", {
    title: "Elegir titular del post de lanzamiento",
    goal: "Post publicado con titular aprobado",
  })) as { item: { id: string } };
  await mcp("items_delegate", { id: titular.item.id, agent_id: "grok-bot" });
  await mcp("items_ask_user", {
    id: titular.item.id,
    reason: "¿Publico la versión A («Relay») o la B («Relevo»)?",
  });
  const note = (await mcp("notes_create", {
    title: "Brief de lanzamiento",
    body_md: "Público: equipos pequeños que usan varias IAs.",
  })) as { note: { id: string } };
  await mcp("notes_link", {
    item_id: titular.item.id,
    note_id: note.note.id,
    role: "context",
  });

  const blocked = (await mcp("items_create", {
    title: "Migrar notas antiguas al store",
  })) as { item: { id: string } };
  await mcp("items_delegate", { id: blocked.item.id, agent_id: "dev-senior" });
  await mcp(
    "items_set_status",
    {
      id: blocked.item.id,
      status: "blocked",
      blocked_reason: "falta acceso de lectura a la carpeta /archive",
    },
    "dev-senior",
  );

  const wip = (await mcp("items_create", {
    title: "Preparar demo para cliente Acme",
  })) as { item: { id: string } };
  await mcp("items_delegate", { id: wip.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", {
    id: wip.item.id,
    status: "in_progress",
  });

  await page.goto("/");
  await page.waitForTimeout(800);

  for (const mode of ["light", "dark"] as const) {
    await page.evaluate((m) => {
      localStorage.setItem("relay.theme", m);
      document.documentElement.classList.toggle("dark", m === "dark");
    }, mode);
    await page.reload();
    await page.getByRole("button", { name: /Atención/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(ART, `ac12-atencion-${mode}.png`),
      fullPage: false,
    });

    await page.getByRole("button", { name: /Con agentes/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(ART, `ac12-con-agentes-${mode}.png`),
      fullPage: false,
    });

    await page.getByRole("button", { name: /Atención/ }).click();
    await page
      .getByRole("group", { name: "Te necesita" })
      .getByText("Elegir titular")
      .first()
      .click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(ART, `ac12-detail-needs-you-${mode}.png`),
      fullPage: false,
    });

    await page.getByRole("button", { name: /Lo que ve el agente/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(ART, `ac12-detail-contexto-${mode}.png`),
      fullPage: false,
    });
    await page.getByRole("button", { name: /Volver/ }).click();
  }
});
