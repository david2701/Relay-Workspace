import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  E2E_API,
  E2E_DB,
  expect,
  readHeadSeq,
  test,
} from "./fixtures";

const API = E2E_API;
const DB = resolve(E2E_DB);

function stdioOps(ops: Array<{ tool: string; args?: Record<string, unknown> }>) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
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
          env: { ...process.env, RELAY_DB: DB },
          encoding: "utf8",
          timeout: 90_000,
        },
      );
      const line = out.trim().split("\n").filter(Boolean).at(-1) ?? "";
      const parsed = JSON.parse(line) as { ok: boolean; results: unknown[] };
      if (!parsed.ok) throw new Error(`stdio drive failed: ${line}`);
      return parsed.results;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
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
    request,
  }) => {
    const latencies: number[] = [];
    // Stable cursor: observe head before mutating so later assertions are
    // relative to this baseline (not a stale suite-wide seq).
    const headBefore = await readHeadSeq(request);
    expect(headBefore).toBeGreaterThanOrEqual(0);

    await fetch(`${API}/api/inbox?view=all&limit=50`);
    await fetch(`${API}/api/search?q=warmup`);

    const title = `E2E-STDIO-${Date.now()}`;
    const needTitle = `E2E-NEED-${Date.now()}`;
    const marker = `E2ENOTE-${Date.now()}`;

    // One stdio process for all MCP mutations (avoids spawn flakiness).
    const results = stdioOps([
      { tool: "items_create", args: { title } },
      { tool: "items_complete", args: { id: "$0.item.id" } },
      { tool: "items_create", args: { title: needTitle } },
      {
        tool: "items_ask_user",
        args: {
          id: "$2.item.id",
          reason: "Need a decision for e2e cross-process",
        },
      },
      { tool: "notes_create", args: { title: "E2E-NOTE", body_md: "before" } },
      {
        tool: "notes_update",
        args: { id: "$4.note.id", body_md: marker },
      },
    ]);

    const created = results[0] as { item: { id: string } };
    const needCreated = results[2] as { item: { id: string } };
    const note = results[4] as { note: { id: string } };

    const createdHit = await waitSearch(title, created.item.id);
    latencies.push(createdHit.ms);
    expect(createdHit.json.items[0]?.item.status).toBe("done");

    await page.goto("/all");
    // Completed item may leave Todo; needs_you should show in Atención.
    await page.goto("/attention");
    await expect(page.getByText(needTitle).first()).toBeVisible({
      timeout: 2000,
    });

    const needHit = await waitSearch(needTitle, needCreated.item.id);
    expect(needHit.json.items[0]?.item.status).toBe("needs_you");
    latencies.push(needHit.ms);

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
    const db = new DatabaseSync(DB);
    db.prepare(
      `UPDATE work_items SET title = ?, updated_at = ? WHERE id = ?`,
    ).run(sqlMarker, new Date().toISOString(), target);
    db.close();
    const sqlHit = await waitSearch(sqlMarker, target!);
    latencies.push(sqlHit.ms);

    const headAfter = await readHeadSeq(request);
    expect(headAfter).toBeGreaterThan(headBefore);

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
        headBefore,
        headAfter,
      }),
    );
    expect(max).toBeLessThanOrEqual(2000);
  });
});
