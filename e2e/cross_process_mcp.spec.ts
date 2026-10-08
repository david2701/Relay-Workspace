import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

const API = process.env.VITE_API_URL ?? "http://127.0.0.1:7430";
const E2E_DB = resolve(process.env.RELAY_DB ?? "/tmp/relay-e2e.db");

function stdioOps(ops: Array<{ tool: string; args?: Record<string, unknown> }>) {
  const out = execFileSync(
    "pnpm",
    [
      "--filter",
      "@relay/server",
      "exec",
      "tsx",
      "scripts/xproc_stdio_drive.ts",
      JSON.stringify({ ops }),
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, RELAY_DB: E2E_DB },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  const line = out.trim().split("\n").filter(Boolean).at(-1) ?? "";
  const parsed = JSON.parse(line) as { ok: boolean; results: unknown[] };
  if (!parsed.ok) throw new Error(`stdio drive failed: ${line}`);
  return parsed.results;
}

async function waitSearch(title: string, id: string, budget = 2000) {
  const t0 = performance.now();
  while (performance.now() - t0 < budget) {
    const res = await fetch(`${API}/api/search?q=${encodeURIComponent(title)}`);
    const json = (await res.json()) as {
      total: number;
      items: Array<{ item: { id: string; title: string; status: string } }>;
    };
    if (json.items.some((r) => r.item.id === id)) {
      return { ms: performance.now() - t0, json };
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`search miss for ${title}`);
}

test.describe("cross-process MCP stdio → HTTP (AC3 ≤2000ms)", () => {
  test("create / complete / needs_you / note edit + raw SQL", async ({
    page,
  }) => {
    const latencies: number[] = [];

    await fetch(`${API}/api/inbox?view=all&limit=50`);
    await fetch(`${API}/api/search?q=warmup`);

    const title = `E2E-STDIO-${Date.now()}`;
    const created = stdioOps([
      { tool: "items_create", args: { title } },
    ])[0] as { item: { id: string } };
    const id = created.item.id;
    const createdHit = await waitSearch(title, id);
    latencies.push(createdHit.ms);

    await page.goto("/all");
    await expect(page.getByText(title).first()).toBeVisible({
      timeout: 2000,
    });

    stdioOps([{ tool: "items_complete", args: { id } }]);
    const doneAt = await waitSearch(title, id);
    expect(doneAt.json.items[0]?.item.status).toBe("done");
    latencies.push(doneAt.ms);

    const needTitle = `E2E-NEED-${Date.now()}`;
    const needCreated = stdioOps([
      { tool: "items_create", args: { title: needTitle } },
    ])[0] as { item: { id: string } };
    stdioOps([
      {
        tool: "items_ask_user",
        args: {
          id: needCreated.item.id,
          reason: "Need a decision for e2e cross-process",
        },
      },
    ]);
    const needHit = await waitSearch(needTitle, needCreated.item.id);
    expect(needHit.json.items[0]?.item.status).toBe("needs_you");
    latencies.push(needHit.ms);

    const note = stdioOps([
      { tool: "notes_create", args: { title: "E2E-NOTE", body_md: "before" } },
    ])[0] as { note: { id: string } };
    const marker = `E2ENOTE-${Date.now()}`;
    stdioOps([
      {
        tool: "notes_update",
        args: { id: note.note.id, body_md: marker },
      },
    ]);
    const t0 = performance.now();
    let noteMs = -1;
    while (performance.now() - t0 < 2000) {
      const res = await fetch(
        `${API}/api/notes/search?q=${encodeURIComponent(marker)}`,
      );
      if (res.ok) {
        const json = (await res.json()) as {
          notes?: Array<{ note?: { id: string }; id?: string }>;
        };
        const hit = (json.notes ?? []).some(
          (n) => n.note?.id === note.note.id || n.id === note.note.id,
        );
        if (hit) {
          noteMs = performance.now() - t0;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    expect(noteMs).toBeGreaterThanOrEqual(0);
    latencies.push(noteMs);

    const list = await fetch(`${API}/api/inbox?view=all&limit=1`);
    const lj = (await list.json()) as { items: Array<{ id: string }> };
    const target = lj.items[0]?.id;
    expect(target).toBeTruthy();
    const sqlMarker = `SQL-E2E-${Date.now()}`;
    const db = new DatabaseSync(E2E_DB);
    db.prepare(
      `UPDATE work_items SET title = ?, updated_at = ? WHERE id = ?`,
    ).run(sqlMarker, new Date().toISOString(), target);
    db.close();
    const sqlHit = await waitSearch(sqlMarker, target!);
    latencies.push(sqlHit.ms);

    const sorted = [...latencies].sort((a, b) => a - b);
    const p95 =
      sorted[
        Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)
      ]!;
    const max = sorted[sorted.length - 1]!;
    console.info(
      JSON.stringify({
        cross_process_latencies_ms: latencies,
        max,
        p95,
      }),
    );
    expect(max).toBeLessThanOrEqual(2000);
  });
});
