import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RelayService } from "@relay/core";
import { loadEnv } from "./env.js";
import { createMcpServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const svc = new RelayService({ dbPath: env.RELAY_DB });
  const server = createMcpServer(svc);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
