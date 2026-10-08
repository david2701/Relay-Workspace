#!/usr/bin/env node
/**
 * Thin wrapper — runs the TypeScript capture under @relay/server.
 *
 *   export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
 *   pnpm --filter @relay/core build
 *   node scripts/capture-mcp-examples.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(
  "pnpm",
  ["--filter", "@relay/server", "exec", "tsx", "scripts/capture_mcp_examples.ts"],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);
process.exit(r.status ?? 1);
