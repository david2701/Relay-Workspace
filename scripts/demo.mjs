#!/usr/bin/env node
/**
 * AC3-D1 — one command demo.
 *
 * From a clone with Node 24.21+ and pnpm (see README):
 *   pnpm demo
 *
 * Installs deps, builds, seeds data/relay-demo.db (EN, onboarding open),
 * starts API+MCP (:7420) and the web UI (:7421), then prints URLs.
 *
 * Why not Docker: the stack is already Node/pnpm; Docker would add a second
 * toolchain without removing install/build. Compose lands in v0.4 for servers.
 *
 * Flags:
 *   --no-install   skip pnpm install (deps already present)
 *   --seed-only    seed demo DB and exit (no servers)
 *   --ready-file=P write "ready" when web+MCP have data (for timing tests)
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoDb = process.env.RELAY_DEMO_DB ?? resolve(root, "data/relay-demo.db");
const apiPort = process.env.RELAY_PORT ?? "7420";
const webPort = process.env.RELAY_WEB_PORT ?? "7421";
const host = "127.0.0.1";
const apiBase = `http://${host}:${apiPort}`;
const webBase = `http://${host}:${webPort}`;

const args = process.argv.slice(2);
const noInstall = args.includes("--no-install");
const seedOnly = args.includes("--seed-only");
const readyFile = args
  .find((a) => a.startsWith("--ready-file="))
  ?.slice("--ready-file=".length);

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...opts.env },
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited ${code}`));
    });
  });
}

async function waitFor(url, { timeoutMs = 120_000, pred } = {}) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        if (!pred || (await pred(res))) return;
      } else {
        lastErr = `${res.status}`;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for ${url} (${lastErr})`);
}

async function main() {
  mkdirSync(dirname(demoDb), { recursive: true });
  console.info("Relay demo — one command (AC3-D1)");
  console.info(`  store: ${demoDb}`);

  if (!noInstall) {
    console.info("\n→ pnpm install --frozen-lockfile");
    await run("pnpm", ["install", "--frozen-lockfile"]);
  }

  console.info("\n→ pnpm build");
  await run("pnpm", ["build"]);

  console.info("\n→ seed demo store (EN, onboarding open)");
  await run(
    "pnpm",
    ["--filter", "@relay/server", "exec", "tsx", "scripts/seed_demo.ts"],
    { env: { RELAY_DEMO_DB: demoDb } },
  );

  if (seedOnly) {
    console.info("\nSeed only — done.");
    return;
  }

  const children = [];
  const stop = () => {
    for (const c of children) {
      if (!c.killed) c.kill("SIGTERM");
    }
  };
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });

  console.info("\n→ start API+MCP and web");
  const server = spawn(
    "pnpm",
    ["--filter", "@relay/server", "exec", "tsx", "src/index.ts"],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        RELAY_DB: demoDb,
        RELAY_HOST: host,
        RELAY_PORT: String(apiPort),
        RELAY_WEB_ORIGIN: webBase,
      },
    },
  );
  children.push(server);

  const web = spawn(
    "pnpm",
    [
      "--filter",
      "@relay/web",
      "exec",
      "vite",
      "--host",
      host,
      "--port",
      String(webPort),
      "--strictPort",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_API_URL: apiBase,
      },
    },
  );
  children.push(web);

  server.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`API exited ${code}`);
      stop();
      process.exit(code);
    }
  });
  web.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`Web exited ${code}`);
      stop();
      process.exit(code);
    }
  });

  await waitFor(`${apiBase}/api/health`);
  await waitFor(`${apiBase}/api/settings`, {
    pred: async (res) => {
      const body = await res.json();
      return (
        body?.settings?.onboarding_completed_at == null &&
        (body?.work_item_count ?? 0) > 0
      );
    },
  });
  {
    const start = Date.now();
    let ok = false;
    while (Date.now() - start < 60_000) {
      try {
        const res = await fetch(`${apiBase}/mcp/invoke`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Relay-Actor": "agent-code",
          },
          body: JSON.stringify({
            name: "items_list",
            arguments: { actor: { id: "agent-code", type: "agent" } },
          }),
        });
        if (res.ok) {
          const body = await res.json();
          const items = body?.result?.items;
          if (Array.isArray(items) && items.length > 0) {
            ok = true;
            break;
          }
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!ok) throw new Error("MCP did not return items");
  }
  await waitFor(webBase);

  if (readyFile) {
    writeFileSync(readyFile, `ready ${new Date().toISOString()}\n`, "utf8");
  }

  console.info(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Relay demo is up

  Web:  ${webBase}
  API:  ${apiBase}/api
  MCP:  ${apiBase}/mcp   (Streamable HTTP)
  Store: ${demoDb}

  Onboarding opens with «Sample data is already loaded.»
  (data is English; reload checkbox checked when UI ≠ EN)

  MCP client config (Streamable HTTP):
  {
    "mcpServers": {
      "relay": { "url": "${apiBase}/mcp" }
    }
  }

  Restart sample data (≤ 30 s, demo store only):
    pnpm demo:reset

  Stop: Ctrl+C
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
