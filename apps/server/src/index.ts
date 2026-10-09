import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { RelayService } from "@relay/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadEnv } from "./env.js";
import { idempotencyMiddleware } from "./idempotency_middleware.js";
import { createMcpHttpHandler, invokeMcpTool } from "./mcp/http.js";
import { createApi } from "./routes/api.js";
import { createSseHub, type SseHub, type SseHubOptions } from "./sse_hub.js";

/**
 * Resolve SPA build directory when present.
 * Dev without dist: Vite (`appType: 'spa'`) already falls back; production
 * needs this server fallback so reloads of `/all?status=blocked` work.
 */
export function resolveWebDist(
  envDist: string | undefined = process.env.RELAY_WEB_DIST,
  cwd: string = process.cwd(),
): string | null {
  const candidates = [
    envDist ? resolve(envDist) : null,
    resolve(cwd, "../web/dist"),
    resolve(cwd, "apps/web/dist"),
    resolve(cwd, "../../apps/web/dist"),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}

export type CreateAppOptions = {
  webDist?: string | null;
  /** Shared SSE hub (tests may inject a short-interval hub). */
  streamHub?: SseHub;
  streamOptions?: SseHubOptions;
};

export function createApp(
  svc: RelayService,
  webOrigin: string,
  opts: CreateAppOptions = {},
): Hono {
  const streamHub =
    opts.streamHub ?? createSseHub(svc, opts.streamOptions ?? {});
  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: [webOrigin, "http://localhost:7421", "http://127.0.0.1:7421"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "X-Relay-Actor",
        "X-Relay-Source",
        "Idempotency-Key",
        "Last-Event-ID",
        "mcp-session-id",
      ],
      exposeHeaders: ["mcp-session-id"],
    }),
  );
  app.use("/api/*", idempotencyMiddleware(svc));
  app.route("/api", createApi(svc, { streamHub }));
  // Stash for tests / graceful shutdown.
  (app as Hono & { streamHub: SseHub }).streamHub = streamHub;
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

  // Callers (main) pass resolveWebDist(); tests omit so API-only behavior is stable.
  const webDist = opts.webDist ?? null;
  if (webDist) {
    const root = relative(process.cwd(), webDist) || ".";
    const indexHtml = readFileSync(join(webDist, "index.html"), "utf8");
    app.use("/*", serveStatic({ root }));
    app.get("*", (c) => {
      const path = c.req.path;
      if (path.startsWith("/api") || path.startsWith("/mcp")) {
        return c.json({ error: "not_found", message: "Not found" }, 404);
      }
      return c.html(indexHtml);
    });
  } else {
    app.get("/", (c) =>
      c.json({
        name: "Relay",
        api: "/api",
        mcp_streamable_http: "/mcp",
        mcp_invoke: "/mcp/invoke",
        mcp_stdio: "pnpm --filter @relay/server mcp:stdio",
        web: "Set RELAY_WEB_DIST or build apps/web (dist/) for SPA fallback",
      }),
    );
  }
  return app;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.RELAY_HOST !== "127.0.0.1" && env.RELAY_HOST !== "localhost") {
    console.error("Security: RELAY_HOST must be 127.0.0.1 (local-only bind)");
    process.exit(1);
  }
  const svc = new RelayService({ dbPath: env.RELAY_DB });
  const webDist = resolveWebDist(process.env.RELAY_WEB_DIST);
  const streamHub = createSseHub(svc, {
    maxConnections: env.RELAY_SSE_MAX_CONNECTIONS,
    resyncThreshold: env.RELAY_SSE_RESYNC_THRESHOLD,
    watchIntervalMs: env.RELAY_SSE_WATCH_MS,
  });
  const app = createApp(svc, env.RELAY_WEB_ORIGIN, { webDist, streamHub });
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
      console.info(`SSE stream: http://${env.RELAY_HOST}:${info.port}/api/stream`);
      console.info(`MCP Streamable HTTP: http://${env.RELAY_HOST}:${info.port}/mcp`);
      console.info(`MCP invoke helper: http://${env.RELAY_HOST}:${info.port}/mcp/invoke`);
      if (webDist) {
        console.info(`SPA static: ${webDist}`);
      } else {
        console.info(
          "SPA: no web dist (RELAY_WEB_DIST / apps/web/dist). Dev: use Vite preview or pnpm --filter @relay/web dev",
        );
      }
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
