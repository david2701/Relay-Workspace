import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RelayService } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpTools } from "../src/mcp/tools.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function documentedToolNames(mdPath: string): string[] {
  const md = readFileSync(mdPath, "utf8");
  return [...md.matchAll(/^### `([a-z][a-z0-9_]+)`\s*$/gm)].map((m) => m[1]!);
}

describe("MCP docs tool list parity", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-mcp-docs-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("README.en.md ### `tool` headings match createMcpTools().map(t => t.name)", () => {
    const registered = createMcpTools(svc).map((t) => t.name);
    const documented = documentedToolNames(join(root, "docs/mcp/README.en.md"));

    expect([...documented].sort()).toEqual([...registered].sort());
    expect(documented).toEqual(registered);
  });

  it("README.es.md documents the same tool set in the same order", () => {
    const registered = createMcpTools(svc).map((t) => t.name);
    const en = documentedToolNames(join(root, "docs/mcp/README.en.md"));
    const es = documentedToolNames(join(root, "docs/mcp/README.es.md"));
    expect(es).toEqual(en);
    expect(es).toEqual(registered);
  });
});
