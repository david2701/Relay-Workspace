/**
 * AC3 loop demo — acts as Grok Bot via MCP invoke helper (same tools/store).
 * Variants: complete | needs_you | blocked
 *
 * Usage:
 *   pnpm demo:ac3
 *   pnpm demo:ac3 -- --variant=needs_you
 *   pnpm demo:ac3 -- --variant=blocked
 *   RELAY_API=http://127.0.0.1:7420 pnpm demo:ac3
 */

const API = process.env.RELAY_API ?? "http://127.0.0.1:7420";
const variant =
  process.argv.find((a) => a.startsWith("--variant="))?.split("=")[1] ??
  "complete";

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
  const json = (await res.json()) as { result?: Record<string, unknown>; error?: string };
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.result ?? {};
}

async function main(): Promise<void> {
  console.info(`AC3 demo → ${API} variant=${variant}`);
  const created = (await mcp("items_create", {
    title: `AC3 demo ${variant} · ${new Date().toLocaleTimeString("es-ES")}`,
    goal: "El web refleja el cambio del agente en ≤2 s",
  })) as { item: { id: string; title: string; status: string } };
  const id = created.item.id;
  console.info(`created ${id} status=${created.item.status}`);

  await mcp("items_delegate", { id, agent_id: "grok-bot" });
  console.info("delegated → grok-bot / assigned");

  await mcp("items_set_status", { id, status: "in_progress" });
  console.info("status → in_progress (watch Con agentes)");

  if (variant === "complete") {
    await sleep(500);
    await mcp("items_complete", { id });
    console.info("status → done (watch Hechos; actor Grok Bot)");
  } else if (variant === "needs_you") {
    await sleep(500);
    await mcp("items_ask_user", {
      id,
      reason: "¿Cierro el PR o espero tu revisión del copy?",
    });
    console.info("status → needs_you (watch Atención › Te necesita)");
  } else if (variant === "blocked") {
    await sleep(500);
    await mcp("items_set_status", {
      id,
      status: "blocked",
      blocked_reason: "el entorno de staging no responde desde hace 10 min",
    });
    console.info("status → blocked (watch Atención › Atascado)");
  } else {
    throw new Error(`Unknown variant: ${variant}`);
  }

  const got = (await mcp("items_get", { id })) as {
    item: { status: string; last_actor_id: string; assignee_id: string | null };
  };
  console.info(
    `final status=${got.item.status} last_actor=${got.item.last_actor_id} assignee=${got.item.assignee_id}`,
  );
  console.info("Open the web at http://127.0.0.1:7421 — changes appear within 2 s.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
