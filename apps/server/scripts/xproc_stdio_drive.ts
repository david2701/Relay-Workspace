/**
 * Drive mcp:stdio as a real second process and print JSON results.
 * Used by e2e/cross_process_mcp.spec.ts.
 *
 * Usage:
 *   RELAY_DB=/abs/path.db pnpm --filter @relay/server exec tsx scripts/xproc_stdio_drive.ts \
 *     '{"ops":[{"tool":"items_create","args":{"title":"Hi"}}]}'
 *
 * Ops may use "$0.item.id" style refs to prior results.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Op = { tool: string; args?: Record<string, unknown> };

function resolveRefs(value: unknown, results: unknown[]): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    const path = value.slice(1).split("."); // e.g. 0.item.id
    let cur: unknown = results;
    for (const part of path) {
      if (cur == null) return value;
      if (/^\d+$/.test(part)) cur = (cur as unknown[])[Number(part)];
      else cur = (cur as Record<string, unknown>)[part];
    }
    return cur ?? value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, results));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveRefs(v, results);
    }
    return out;
  }
  return value;
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw) throw new Error("missing ops json");
  const { ops } = JSON.parse(raw) as { ops: Op[] };
  const db = process.env.RELAY_DB;
  if (!db) throw new Error("RELAY_DB required");

  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--filter", "@relay/server", "mcp:stdio"],
    env: Object.fromEntries(
      Object.entries({ ...process.env, RELAY_DB: db }).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    ),
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({ name: "xproc-drive", version: "0.0.0" });
  await client.connect(transport);
  const out: unknown[] = [];
  try {
    for (const op of ops) {
      const args = resolveRefs(op.args ?? {}, out) as Record<string, unknown>;
      const result = await client.callTool({
        name: op.tool,
        arguments: {
          ...args,
          actor: { type: "agent", id: "agent-code" },
        },
      });
      const structured = (result as { structuredContent?: unknown })
        .structuredContent;
      if (structured) {
        out.push(structured);
        continue;
      }
      const text = (
        result as { content?: Array<{ type: string; text?: string }> }
      ).content?.find((c) => c.type === "text")?.text;
      if (text) {
        try {
          out.push(JSON.parse(text));
        } catch {
          out.push(text);
        }
      } else {
        out.push(result);
      }
    }
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
  process.stdout.write(`${JSON.stringify({ ok: true, results: out })}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
