import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { RelayService } from "@relay/core";
import type { Context } from "hono";
import { createMcpServer } from "./server.js";
import { createMcpTools } from "./tools.js";

/**
 * Streamable HTTP MCP endpoint (web-standard Request/Response).
 * Same RelayService / SQLite store as the REST API.
 */
export function createMcpHttpHandler(svc: RelayService) {
  return async (c: Context): Promise<Response> => {
    const server = createMcpServer(svc);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  };
}

/** JSON helper for demos/tests without a full MCP client. */
export async function invokeMcpTool(
  svc: RelayService,
  name: string,
  args: Record<string, unknown>,
  headerActor?: string,
): Promise<unknown> {
  const tools = createMcpTools(svc);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args, headerActor);
}
