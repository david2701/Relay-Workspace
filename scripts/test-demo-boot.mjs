#!/usr/bin/env node
/**
 * AC3-D1 timing gate: run the demo boot path and assert web + MCP respond
 * with data in ≤ 5 minutes.
 *
 * Uses --no-install when node_modules already exist (typical agent/CI image)
 * but still runs install+build+seed+start when RELAY_DEMO_BOOT_FULL=1.
 *
 * Writes artifacts/demo-boot-timing.json with the measured duration.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, "artifacts");
const readyFile = resolve(artifacts, "demo-boot-ready.txt");
const outFile = resolve(artifacts, "demo-boot-timing.json");
const demoDb =
  process.env.RELAY_DEMO_DB ?? resolve(root, "data/relay-demo-boot.db");
const apiPort = process.env.RELAY_PORT ?? "7422";
const webPort = process.env.RELAY_WEB_PORT ?? "7423";
const limitMs = 5 * 60 * 1000;
const full = process.env.RELAY_DEMO_BOOT_FULL === "1";

mkdirSync(artifacts, { recursive: true });
for (const p of [demoDb, `${demoDb}-wal`, `${demoDb}-shm`, readyFile]) {
  try {
    rmSync(p, { force: true });
  } catch {
    /* ignore */
  }
}

const args = ["scripts/demo.mjs", `--ready-file=${readyFile}`];
if (!full && existsSync(resolve(root, "node_modules"))) {
  args.push("--no-install");
}

const started = Date.now();
const child = spawn("node", args, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    RELAY_DEMO_DB: demoDb,
    RELAY_PORT: String(apiPort),
    RELAY_WEB_PORT: String(webPort),
  },
});

function finish(ok, error) {
  const elapsedMs = Date.now() - started;
  const report = {
    ok,
    elapsedMs,
    elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
    limitMs,
    demoDb,
    api: `http://127.0.0.1:${apiPort}`,
    web: `http://127.0.0.1:${webPort}`,
    fullInstall: full || !existsSync(resolve(root, "node_modules")),
    error: error ?? null,
    readyFileExists: existsSync(readyFile),
    readyFile: existsSync(readyFile)
      ? readFileSync(readyFile, "utf8").trim()
      : null,
  };
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info("\nAC3-D1 timing report:");
  console.info(JSON.stringify(report, null, 2));
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  // Give children a moment, then hard-exit.
  setTimeout(() => process.exit(ok ? 0 : 1), 500);
}

const timer = setInterval(() => {
  if (existsSync(readyFile)) {
    clearInterval(timer);
    const elapsedMs = Date.now() - started;
    if (elapsedMs > limitMs) {
      finish(false, `exceeded ${limitMs}ms (${elapsedMs}ms)`);
    } else {
      finish(true);
    }
  } else if (Date.now() - started > limitMs + 15_000) {
    clearInterval(timer);
    finish(false, "ready file never appeared within limit+grace");
  }
}, 250);

child.on("exit", (code) => {
  if (!existsSync(readyFile)) {
    clearInterval(timer);
    finish(false, `demo process exited early with code ${code}`);
  }
});
