#!/usr/bin/env node
/**
 * AC3-D4 — restart demo sample data in ≤ 30 s.
 * Only touches data/relay-demo.db (or RELAY_DEMO_DB). Never data/relay.db.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoDb = process.env.RELAY_DEMO_DB ?? resolve(root, "data/relay-demo.db");
const userDb = resolve(root, "data/relay.db");

if (demoDb === userDb) {
  console.error("Refusing to reset: RELAY_DEMO_DB must not be data/relay.db");
  process.exit(1);
}

const started = Date.now();
const child = spawn(
  "pnpm",
  ["--filter", "@relay/server", "exec", "tsx", "scripts/reset_demo.ts"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, RELAY_DEMO_DB: demoDb },
  },
);

child.on("exit", (code) => {
  const ms = Date.now() - started;
  console.info(`demo:reset finished in ${(ms / 1000).toFixed(2)}s`);
  if (ms > 30_000) {
    console.error("AC3-D4 failed: reset took longer than 30 s");
    process.exit(1);
  }
  process.exit(code ?? 1);
});
