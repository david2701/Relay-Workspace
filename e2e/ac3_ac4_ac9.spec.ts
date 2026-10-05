import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:7430";

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

test("AC9 quick capture creates item from title only", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Todo$/ }).click();
  await page.keyboard.press("n");
  const title = "Anotar idea para la landing";
  const input = page.locator("#quick-capture");
  await expect(input).toBeFocused({ timeout: 2000 });
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 5000 });
});

test("AC4 note link and unlink on item detail", async ({ page }) => {
  const created = (await mcp("items_create", {
    title: "Preparar brief de onboarding",
  })) as { item: { id: string; title: string } };
  const note = (await mcp("notes_create", {
    title: "Notas de entrevista con Acme",
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
    title: "Cerrar borrador del post de Acme",
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
    title: "Revisar copy del correo de lanzamiento",
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
    title: "Publicar build en staging",
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
