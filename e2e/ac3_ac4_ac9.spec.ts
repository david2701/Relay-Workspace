import { expect, test } from "@playwright/test";
import {
  expectAgentMarksAreSquares,
  expectHechosOnlyTerminal,
  expectSectionCountsMatch,
  waitInboxView,
} from "./helpers";

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

test("AC3 complete via MCP appears once in Hechos with matching group count", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Con agentes/ }).click();
  await waitInboxView(page, "agent_wip");

  const created = (await mcp("items_create", {
    title: "Cerrar el informe de métricas del viernes",
    goal: "Visible en Hechos",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", { id: created.item.id, status: "in_progress" });

  await expect(page.getByText(created.item.title).first()).toBeVisible({
    timeout: 4000,
  });
  await expectAgentMarksAreSquares(page.locator(".item-list"));

  await mcp("items_complete", { id: created.item.id });
  await expect(
    page.getByRole("option", { name: new RegExp(created.item.title) }),
  ).toHaveCount(1, { timeout: 4000 });

  await page.getByRole("button", { name: /^Hechos$/ }).click();
  await waitInboxView(page, "done");
  const hechosRow = page.getByRole("option", {
    name: new RegExp(created.item.title),
  });
  await expect(hechosRow).toHaveCount(1, { timeout: 4000 });
  await expect(page.getByText(/Completado por Grok Bot/i).first()).toBeVisible({
    timeout: 4000,
  });
  await expectHechosOnlyTerminal(page);
  await page.waitForTimeout(2200);
  await expect(hechosRow).toHaveCount(1);
  await expectHechosOnlyTerminal(page);
});

test("AC3 needs_you via MCP appears in Atención within 2s", async ({
  page,
}) => {
  await page.goto("/");
  await waitInboxView(page, "attention");
  const created = (await mcp("items_create", {
    title: "Elegir asunto del correo de onboarding",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  await mcp("items_ask_user", {
    id: created.item.id,
    reason: "¿Cierro el PR o espero tu revisión?",
  });

  const row = page.getByRole("option", { name: new RegExp(created.item.title) });
  await expect(row).toBeVisible({ timeout: 4000 });
  await expect(row.getByText(/¿Cierro el PR/)).toBeVisible({ timeout: 4000 });
  await expectSectionCountsMatch(page);
  const counter = page.locator('[data-rail-counter="attention"]');
  await expect(counter).toBeVisible({ timeout: 4000 });
  await expect(counter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(counter).toHaveCSS("border-radius", "0px");
});

test("AC3 blocked via MCP appears in Atascado within 2s", async ({ page }) => {
  await page.goto("/");
  await waitInboxView(page, "attention");
  const created = (await mcp("items_create", {
    title: "Desplegar la API en el entorno de pruebas",
  })) as { item: { id: string; title: string } };
  await mcp("items_delegate", { id: created.item.id, agent_id: "grok-bot" });
  await mcp("items_set_status", {
    id: created.item.id,
    status: "blocked",
    blocked_reason: "el entorno de staging no responde",
  });

  const row = page
    .getByRole("group", { name: /Atascado/ })
    .getByRole("option", { name: new RegExp(created.item.title) });
  await expect(row).toBeVisible({ timeout: 4000 });
  await expect(row.getByText(/Atascado: el entorno/)).toBeVisible({
    timeout: 4000,
  });
  await expectSectionCountsMatch(page);
});

test("AC6 Con agentes excludes needs_you; only Atención has a counter", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-rail-counter="attention"]')).toHaveText(
    /^[1-9]/,
  );
  await page.getByRole("button", { name: /Con agentes/ }).click();
  await waitInboxView(page, "agent_wip");
  await expect(
    page.locator('.rail button:has-text("Con agentes") .rail-count'),
  ).toHaveCount(0);
  await expect(page.locator(".rail-count")).toHaveCount(1);
  await expect(
    page.getByRole("option", { name: /Elegir titular del post de lanzamiento/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: /Preparar demo para cliente Acme/ }),
  ).toBeVisible();
  await expectAgentMarksAreSquares(page.locator(".item-list"));
  await page.getByRole("button", { name: /Atención/ }).click();
  await waitInboxView(page, "attention");
  await expectSectionCountsMatch(page);
  await expect(
    page.getByRole("option", { name: /Elegir titular del post de lanzamiento/ }),
  ).toBeVisible();
});

test("AC10 Sugerido needs_you owner mark is agent square, not human circle", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Atención/ }).click();
  const sug = page
    .locator(".suggested-row")
    .filter({ hasText: "Elegir titular" })
    .first();
  await expect(sug).toBeVisible({ timeout: 4000 });
  const mark = sug.locator(".actor-mark");
  await expect(mark).toHaveAttribute("data-kind", "agent");
  await expect(mark).toHaveAttribute("data-shape", "square");
  await expect(mark).toHaveAttribute("data-monogram", "GB");
  const radius = await mark.evaluate((el) => getComputedStyle(el).borderRadius);
  expect(radius).not.toBe("50%");

  const listRow = page
    .getByRole("option", { name: /Elegir titular/ })
    .locator(".actor-mark");
  await expect(listRow).toHaveAttribute("data-kind", "user");
  await expect(listRow).toHaveAttribute("data-shape", "circle");
  await expect(listRow).toHaveAttribute("data-monogram", "D");
  await expectAgentMarksAreSquares(page.locator(".suggested"));
});
