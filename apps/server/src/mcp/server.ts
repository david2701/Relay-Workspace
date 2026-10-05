import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RelayService } from "@relay/core";
import { z } from "zod";
import { createMcpTools } from "./tools.js";

/** Zod → JSON Schema-ish shape for MCP SDK registerTool. */
function zodToShape(schema: z.ZodType): Record<string, z.ZodType> {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodType>;
  }
  if (schema instanceof z.ZodIntersection) {
    const left = zodToShape(schema._def.left as z.ZodType);
    const right = zodToShape(schema._def.right as z.ZodType);
    return { ...left, ...right };
  }
  return {};
}

export function createMcpServer(svc: RelayService): McpServer {
  const server = new McpServer({
    name: "relay",
    version: "0.1.0",
  });
  const tools = createMcpTools(svc);
  for (const tool of tools) {
    const shape = zodToShape(tool.inputSchema);
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: shape,
      },
      async (args) => {
        try {
          const result = tool.handler(args);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
            structuredContent:
              typeof result === "object" && result !== null
                ? (result as Record<string, unknown>)
                : { value: result },
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    );
  }
  return server;
}
