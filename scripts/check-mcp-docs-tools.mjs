#!/usr/bin/env node
/**
 * Ensure docs/mcp/README.en.md tool headings match createMcpTools() names.
 *
 *   pnpm check:mcp-docs
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(
  "pnpm",
  [
    "--filter",
    "@relay/server",
    "exec",
    "vitest",
    "run",
    "tests/mcp_docs_tools.test.ts",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);
process.exit(r.status ?? 1);
