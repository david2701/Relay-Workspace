import { serve } from "@hono/node-server";
import { RelayService } from "@relay/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadEnv } from "./env.js";
import { createMcpHttpHandler, invokeMcpTool } from "./mcp/http.js";
import { createApi } from "./routes/api.js";

export function createApp(svc: RelayService, webOrigin: string): Hono {
  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: [webOrigin, "http://localhost:7421", "http://127.0.0.1:7421"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "X-Relay-Actor",
        "X-Relay-Source",
        "mcp-session-id",
      ],
      exposeHeaders: ["mcp-session-id"],
    }),
  );
  app.route("/api", createApi(svc));
  const mcpHandler = createMcpHttpHandler(svc);
  app.all("/mcp", mcpHandler);
  app.post("/mcp/invoke", async (c) => {
    try {
      const body = await c.req.json();
      const name = String(body.name ?? "");
      const args = (body.arguments ?? {}) as Record<string, unknown>;
      const headerActor = c.req.header("x-relay-actor") ?? undefined;
      const result = await invokeMcpTool(svc, name, args, headerActor);
      return c.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });
  app.get("/", (c) =>
    c.json({
      name: "Relay",
      api: "/api",
      mcp_streamable_http: "/mcp",
      mcp_invoke: "/mcp/invoke",
      mcp_stdio: "pnpm --filter @relay/server mcp:stdio",
    }),
  );
  return app;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.RELAY_HOST !== "127.0.0.1" && env.RELAY_HOST !== "localhost") {
    console.error("Security: RELAY_HOST must be 127.0.0.1 (local-only bind)");
    process.exit(1);
  }
  const svc = new RelayService({ dbPath: env.RELAY_DB });
  const app = createApp(svc, env.RELAY_WEB_ORIGIN);
  serve(
    {
      fetch: app.fetch,
      hostname: env.RELAY_HOST,
      port: env.RELAY_PORT,
    },
    (info) => {
      console.info(
        `Relay API+MCP listening on http://${env.RELAY_HOST}:${info.port}`,
      );
      console.info(`SQLite: ${env.RELAY_DB}`);
      console.info(`MCP Streamable HTTP: http://${env.RELAY_HOST}:${info.port}/mcp`);
      console.info(`MCP invoke helper: http://${env.RELAY_HOST}:${info.port}/mcp/invoke`);
    },
  );
}

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
