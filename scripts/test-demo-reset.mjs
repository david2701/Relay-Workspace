#!/usr/bin/env node
/**
 * AC3-D4 script gate: reset demo store in ≤ 30 s; leave a sibling store intact.
 * Delegates to a tsx runner so it can import the seed module.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = spawnSync("pnpm", ["run", "build:core"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const run = spawnSync(
  "pnpm",
  [
    "--filter",
    "@relay/server",
    "exec",
    "tsx",
    resolve(root, "scripts/test-demo-reset-run.ts"),
  ],
  { cwd: root, stdio: "inherit" },
);
process.exit(run.status ?? 1);
