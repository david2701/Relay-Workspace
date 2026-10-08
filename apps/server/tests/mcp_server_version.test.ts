import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RelayService } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMcpServer,
  MCP_SERVER_VERSION,
} from "../src/mcp/server.js";

const PACKAGE_JSON = join(
  dirname(fileURLToPath(import.meta.url)),
  "../package.json",
);

describe("MCP server version", () => {
  let dir: string;
  let svc: RelayService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-mcp-ver-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
  });

  afterEach(() => {
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("matches apps/server package.json and initialize serverInfo", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBeTruthy();
    expect(MCP_SERVER_VERSION).toBe(pkg.version);
    const mcp = createMcpServer(svc);
    const info = (
      mcp.server as unknown as { _serverInfo: { name: string; version: string } }
    )._serverInfo;
    expect(info.name).toBe("relay");
    expect(info.version).toBe(pkg.version);
  });
});
