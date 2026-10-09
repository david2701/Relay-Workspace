import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";

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
      timeout: 90_000,
    },
  );
  const line = out.trim().split("\n").filter(Boolean).at(-1) ?? "";
  const parsed = JSON.parse(line) as { ok: boolean; results: unknown[] };
  if (!parsed.ok) throw new Error(`stdio drive failed: ${line}`);
  return parsed.results;
}

async function completeOnboarding(page: Page): Promise<void> {
  await page.goto("/attention");
  const card = page.locator(".onboarding-card");
  if (await card.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /empezar vacío|start empty|commencer vide/i }).click();
    await expect(card).toBeHidden({ timeout: 10_000 });
  }
}

test.describe("SSE realtime (PR 1c)", () => {
  test("MCP change appears in UI ≤2000ms with no 750ms inbox polling", async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page.goto("/all");
    await expect(page.locator(".sync-seal")).toBeVisible();
    await expect(page.locator(".sync-seal")).toHaveAttribute(
      "data-sync-state",
      "connected",
      { timeout: 10_000 },
    );

    const inboxGets: number[] = [];
    page.on("request", (req: Request) => {
      const url = req.url();
      if (req.method() === "GET" && url.includes("/api/inbox")) {
        inboxGets.push(Date.now());
      }
    });

    // Idle 10s — must not see a 750ms cadence of /api/inbox.
    await page.waitForTimeout(10_000);
    const gaps: number[] = [];
    for (let i = 1; i < inboxGets.length; i += 1) {
      gaps.push((inboxGets[i] ?? 0) - (inboxGets[i - 1] ?? 0));
    }
    const pollLike = gaps.filter((g) => g >= 600 && g <= 900).length;
    expect(
      pollLike,
      `expected no 750ms inbox poll cadence; gaps=${JSON.stringify(gaps)} count=${inboxGets.length}`,
    ).toBeLessThan(3);

    const title = `SSE-MCP-${Date.now()}`;
    const t0 = performance.now();
    stdioOps([{ tool: "items_create", args: { title } }]);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 2000 });
    expect(performance.now() - t0).toBeLessThanOrEqual(2000);
  });

  test("SSE drop + 3 changes → reconnect shows all 3; seal reconnecting→ok", async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page.goto("/all");
    await expect(page.locator(".sync-seal")).toHaveAttribute(
      "data-sync-state",
      "connected",
      { timeout: 10_000 },
    );

    // Kill the SSE connection while making 3 MCP changes.
    await page.route("**/api/stream*", (route) => route.abort());
    await page.waitForTimeout(500);
    await expect(page.locator(".sync-seal")).toHaveAttribute(
      "data-sync-state",
      /reconnecting|offline/,
      { timeout: 8_000 },
    );
    const sealText = await page.locator(".sync-seal").innerText();
    expect(sealText.length).toBeGreaterThan(0);

    const titles = [0, 1, 2].map((i) => `SSE-RECOVER-${Date.now()}-${i}`);
    stdioOps(titles.map((title) => ({ tool: "items_create", args: { title } })));

    // Restore stream; EventSource / hook reconnects and replays via after_seq.
    await page.unroute("**/api/stream*");
    // Nudge reconnect by reloading visibility / soft navigation.
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Force a fresh EventSource by soft-reloading the lens.
    await page.goto("/all");

    for (const title of titles) {
      await expect(page.getByText(title).first()).toBeVisible({
        timeout: 5000,
      });
    }
    await expect(page.locator(".sync-seal")).toHaveAttribute(
      "data-sync-state",
      "connected",
      { timeout: 10_000 },
    );
    await expect(page.locator(".sync-seal")).toContainText(/up to date|al día|à jour/i);
  });
});
