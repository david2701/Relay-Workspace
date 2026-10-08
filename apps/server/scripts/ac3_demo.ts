/**
 * AC3 loop demo — isolated by default (temp SQLite + ephemeral HTTP).
 *
 *   pnpm demo:ac3
 *   pnpm demo:ac3 -- --variant=needs_you
 *   pnpm demo:ac3 -- --variant=blocked
 *
 * To drive a live web session (will mutate that DB):
 *   RELAY_API=http://127.0.0.1:7420 pnpm demo:ac3 -- --variant=needs_you
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { RelayService } from "@relay/core";
import { createApp } from "../src/index.js";

const LIVE_API = process.env.RELAY_API;
const variant =
  process.argv.find((a) => a.startsWith("--variant="))?.split("=")[1] ??
  "complete";

const TITLES: Record<string, string> = {
  complete: "Cerrar borrador del post de Acme",
  needs_you: "Revisar copy del correo de lanzamiento",
  blocked: "Publicar build en staging",
};

async function mcpAgainst(
  api: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${api}/mcp/invoke`, {
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
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.result ?? {};
}

async function runLoop(api: string): Promise<void> {
  const title = TITLES[variant] ?? TITLES.complete;
  console.info(`AC3 demo → ${api} variant=${variant}`);
  const created = (await mcpAgainst(api, "items_create", {
    title,
    goal: "El web refleja el cambio del agente en ≤2 s",
  })) as { item: { id: string; title: string; status: string } };
  const id = created.item.id;
  console.info(`created ${id} «${created.item.title}» status=${created.item.status}`);

  await mcpAgainst(api, "items_delegate", { id, agent_id: "grok-bot" });
  console.info("delegated → grok-bot / assigned");

  await mcpAgainst(api, "items_set_status", { id, status: "in_progress" });
  console.info("status → in_progress");

  if (variant === "complete") {
    await sleep(200);
    await mcpAgainst(api, "items_complete", { id });
    console.info("status → done");
  } else if (variant === "needs_you") {
    await sleep(200);
    await mcpAgainst(api, "items_ask_user", {
      id,
      reason: "¿Cierro el PR o espero tu revisión del copy?",
    });
    console.info("status → needs_you");
  } else if (variant === "blocked") {
    await sleep(200);
    await mcpAgainst(api, "items_set_status", {
      id,
      status: "blocked",
      blocked_reason: "el entorno de staging no responde desde hace 10 min",
    });
    console.info("status → blocked");
  } else {
    throw new Error(`Unknown variant: ${variant}`);
  }

  const got = (await mcpAgainst(api, "items_get", { id })) as {
    item: { status: string; last_actor_id: string; assignee_id: string | null };
  };
  console.info(
    `final status=${got.item.status} last_actor=${got.item.last_actor_id} assignee=${got.item.assignee_id}`,
  );
}

async function withIsolatedServer(
  fn: (api: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "relay-ac3-"));
  const dbPath = join(dir, "relay.db");
  const svc = new RelayService({ dbPath });
  const app = createApp(svc, "http://127.0.0.1:7421");
  const port = 17420 + Math.floor(Math.random() * 200);
  const api = `http://127.0.0.1:${port}`;
  const server = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
    try {
      const s = serve(
        {
          fetch: app.fetch,
          hostname: "127.0.0.1",
          port,
        },
        (info) => {
          console.info(`Isolated AC3 store: ${dbPath}`);
          console.info(`Isolated AC3 API: http://127.0.0.1:${info.port}`);
          resolve(s);
        },
      );
      s.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
  try {
    await fn(api);
  } finally {
    server.close();
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  if (LIVE_API) {
    console.warn(
      "RELAY_API set — demo mutates the live store. Prefer isolated default for CI.",
    );
    await runLoop(LIVE_API);
    console.info(`Watch the web if it points at ${LIVE_API}.`);
    return;
  }
  await withIsolatedServer(runLoop);
  console.info("Isolated demo finished (no shared DB mutated).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
