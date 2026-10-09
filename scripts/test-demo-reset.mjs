#!/usr/bin/env node
/**
 * AC3-D4 script gate: reset demo store in ≤ 30 s; leave a sibling store intact.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = spawnSync("pnpm", ["run", "build:core"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const run = spawnSync(
  "pnpm",
  ["--filter", "@relay/server", "exec", "tsx", "scripts/test_demo_reset.ts"],
  { cwd: root, stdio: "inherit" },
);
process.exit(run.status ?? 1);
