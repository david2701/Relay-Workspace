#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * Live DOM verification for V1–V4 against the running web app.
 */
import { chromium } from "@playwright/test";

const API = process.env.RELAY_API ?? "http://127.0.0.1:7420";
const WEB = process.env.RELAY_WEB ?? "http://127.0.0.1:7421";
const ART = "/opt/cursor/artifacts";

async function mcp(name, args) {
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
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? res.status);
  return json.result ?? {};
}

async function sectionAudit(page) {
  return page.evaluate(() => {
    const groups = [...document.querySelectorAll('.item-list [role="group"]')];
    return groups.map((g) => {
      const label = g.querySelector(".section-label")?.textContent?.trim() ?? "";
      const m = label.match(/·\s*(\d+)\s*$/);
      const headerN = m ? Number(m[1]) : null;
      const rows = g.querySelectorAll('[role="option"]').length;
      const attr = g.getAttribute("data-section-count");
      return { label, headerN, rows, attr: attr === null ? null : Number(attr) };
    });
  });
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const evidence = { v1: {}, v2: {}, v3: {}, v4: {} };

  await page.goto(WEB);
  await page.getByRole("button", { name: /Atención/ }).click();
  await page.locator('[data-inbox-view="attention"]').waitFor();

  // —— V1: mutate blocked + needs_you; header N must equal rows; rail = Te necesita ——
  const b = await mcp("items_create", { title: "V1 Publicar build en staging" });
  await mcp("items_delegate", { id: b.item.id, agent_id: "agent-code" });
  await mcp("items_set_status", {
    id: b.item.id,
    status: "blocked",
    blocked_reason: "staging caído",
  });
  await page
    .getByRole("option", { name: /V1 Publicar build/ })
    .waitFor({ timeout: 2000 });
  const afterBlocked = await sectionAudit(page);
  const railAfterBlocked = await page
    .locator('[data-rail-counter="attention"]')
    .textContent();
  const teRows = afterBlocked.find((s) => /Te necesita/i.test(s.label))?.rows;
  evidence.v1.afterBlocked = { sections: afterBlocked, rail: railAfterBlocked, teRows };
  evidence.v1.blockedCountsMatch = afterBlocked.every(
    (s) => s.headerN === null || (s.headerN === s.rows && s.attr === s.rows),
  );

  const a = await mcp("items_create", {
    title: "V1 Revisar copy del correo de lanzamiento",
  });
  await mcp("items_delegate", { id: a.item.id, agent_id: "agent-code" });
  await mcp("items_ask_user", { id: a.item.id, reason: "¿Publico A o B?" });
  await page
    .getByRole("option", { name: /V1 Revisar copy/ })
    .waitFor({ timeout: 2000 });
  const afterAsk = await sectionAudit(page);
  const railAfterAsk = await page
    .locator('[data-rail-counter="attention"]')
    .textContent();
  const teAfter = afterAsk.find((s) => /Te necesita/i.test(s.label));
  evidence.v1.afterAsk = { sections: afterAsk, rail: railAfterAsk };
  evidence.v1.askCountsMatch = afterAsk.every(
    (s) => s.headerN === null || (s.headerN === s.rows && s.attr === s.rows),
  );
  evidence.v1.railMatchesTeNecesita =
    teAfter && String(teAfter.rows) === (railAfterAsk ?? "").trim();

  await page.screenshot({
    path: resolve(ART, "v1_section_counts_after_mutations.png"),
  });

  // —— V2: agent marks square in Sugerido + Con agentes; user circle in Te necesita ——
  const sug = page.locator(".suggested-row .actor-mark[data-kind='agent']").first();
  const sugShape = await sug.getAttribute("data-shape");
  const sugRadius = await sug.evaluate((el) => getComputedStyle(el).borderRadius);
  const listUser = page
    .getByRole("group", { name: /Te necesita/ })
    .locator('.actor-mark[data-kind="user"]')
    .first();
  const userShape = await listUser.getAttribute("data-shape");
  const userRadius = await listUser.evaluate(
    (el) => getComputedStyle(el).borderRadius,
  );
  await page.getByRole("button", { name: /Con agentes/ }).click();
  await page.locator('[data-inbox-view="agent_wip"]').waitFor();
  const agentMarks = await page
    .locator('.item-list .actor-mark[data-kind="agent"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        shape: el.getAttribute("data-shape"),
        radius: getComputedStyle(el).borderRadius,
        mono: el.getAttribute("data-monogram"),
      })),
    );
  evidence.v2 = {
    sugerido: { shape: sugShape, radius: sugRadius },
    teNecesitaUser: { shape: userShape, radius: userRadius },
    conAgentesAgents: agentMarks,
    allAgentsSquare:
      sugShape === "square" &&
      sugRadius !== "50%" &&
      agentMarks.every((m) => m.shape === "square" && m.radius !== "50%"),
    usersCircle: userShape === "circle" && userRadius === "50%",
  };
  await page.screenshot({ path: resolve(ART, "v2_actormark_con_agentes.png") });

  // —— V3: empty detail shortcuts must be clean Spanish, no -1% / NaN ——
  await page.getByRole("button", { name: /Atención/ }).click();
  await page.locator('[data-inbox-view="attention"]').waitFor();
  // Deselect if any
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const emptyKeys = await page.locator(".detail-empty-keys").innerText();
  const emptyBody = await page.locator(".detail-empty").innerText();
  const syncSeal = await page.locator(".sync-seal").innerText();
  evidence.v3 = {
    emptyBody,
    emptyKeys,
    syncSeal,
    hasNegativePercent: /-1%/.test(emptyKeys) || /-1%/.test(syncSeal),
    hasNaN: /NaN/.test(emptyKeys) || /NaN/.test(syncSeal),
    looksLikeSpanishShortcuts:
      /captura/.test(emptyKeys) &&
      /navega/.test(emptyKeys) &&
      /completa/.test(emptyKeys) &&
      /delega/.test(emptyKeys),
  };
  await page.screenshot({ path: resolve(ART, "v3_detail_empty_shortcuts.png") });

  // —— V4: open agent view with decisión note ——
  await page.getByRole("option", { name: /V1 Revisar copy/ }).click();
  await page.locator(".reason-banner.needs_you textarea").fill("Publica la opción A.");
  await page.getByRole("button", { name: /Devolver a Code agent/ }).click();
  await page.getByText(/Decisión:/i).first().waitFor({ timeout: 2000 });
  await page.getByRole("button", { name: /Lo que ve el agente/ }).click();
  const agentView = page.locator(".agent-view");
  await agentView.waitFor({ timeout: 2000 });
  const agentText = await agentView.innerText();
  evidence.v4 = {
    agentViewVisible: await agentView.isVisible(),
    hasDecisionBody: /Publica la opción A/.test(agentText),
    hasNotesSection: /Notas/i.test(agentText),
    snippet: agentText.slice(0, 400),
  };
  await page.screenshot({ path: resolve(ART, "v4_lo_que_ve_el_agente.png") });

  const pass =
    evidence.v1.blockedCountsMatch &&
    evidence.v1.askCountsMatch &&
    evidence.v1.railMatchesTeNecesita &&
    evidence.v2.allAgentsSquare &&
    evidence.v2.usersCircle &&
    !evidence.v3.hasNegativePercent &&
    !evidence.v3.hasNaN &&
    evidence.v3.looksLikeSpanishShortcuts &&
    evidence.v4.agentViewVisible &&
    evidence.v4.hasDecisionBody;

  writeFileSync(
    resolve(ART, "v1-v4-verify.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.info(JSON.stringify({ pass, evidence }, null, 2));
  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
