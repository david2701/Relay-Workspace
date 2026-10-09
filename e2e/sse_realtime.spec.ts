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

    // Abort stream *then* reload so the new EventSource fails (an already-open
    // SSE socket is not torn down by Playwright route.abort alone).
    await page.route("**/api/stream*", (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".sync-seal")).toBeVisible();
    await expect(page.locator(".sync-seal")).toHaveAttribute(
      "data-sync-state",
      /reconnecting|offline/,
      { timeout: 10_000 },
    );
    await expect(page.locator(".sync-seal")).toContainText(
      /reconect|reconnect|hors ligne|offline|sin conexión/i,
    );

    const titles = [0, 1, 2].map((i) => `SSE-RECOVER-${Date.now()}-${i}`);
    stdioOps(titles.map((title) => ({ tool: "items_create", args: { title } })));

    // Restore stream; reload opens EventSource which resumes via after_seq /
    // Last-Event-ID (and snapshot includes the three writes).
    await page.unroute("**/api/stream*");
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

  for (const locale of ["en", "fr", "es"] as const) {
    test(`collapsed rail @768 (${locale}): dot-only, unclipped, full aria-label for all states`, async ({
      page,
    }) => {
      const labelRe: Record<
        "connected" | "reconnecting" | "offline",
        RegExp
      > = {
        connected:
          locale === "fr"
            ? /à jour/i
            : locale === "es"
              ? /al día/i
              : /up to date/i,
        reconnecting:
          locale === "fr"
            ? /reconnexion/i
            : locale === "es"
              ? /reconectando/i
              : /reconnecting/i,
        offline:
          locale === "fr"
            ? /hors ligne/i
            : locale === "es"
              ? /sin conexión/i
              : /offline/i,
      };

      await page.addInitScript((loc) => {
        localStorage.setItem("relay.locale", loc);
      }, locale);
      await page.setViewportSize({ width: 768, height: 1024 });
      await completeOnboarding(page);
      await page.goto("/all");

      const seal = page.locator(".sync-seal");
      const label = page.locator(".sync-seal-label");

      async function assertCompactState(
        state: "connected" | "reconnecting" | "offline",
      ): Promise<void> {
        // Poll one DOM snapshot — abort/reload can flip state between
        // sequential getAttribute calls.
        await expect
          .poll(
            async () => {
              const snap = await seal.evaluate((el: HTMLElement) => ({
                state: el.getAttribute("data-sync-state"),
                aria: el.getAttribute("aria-label") ?? "",
                title: el.getAttribute("title") ?? "",
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                painted: (el.innerText ?? "").trim(),
              }));
              const labelsOk =
                labelRe[state].test(snap.aria) &&
                labelRe[state].test(snap.title) &&
                snap.aria === snap.title;
              const unclipped =
                snap.scrollWidth <= snap.clientWidth + 1;
              return (
                snap.state === state &&
                labelsOk &&
                unclipped &&
                snap.painted === ""
              );
            },
            { timeout: 15_000 },
          )
          .toBe(true);
        await expect(label).toBeHidden();
      }

      await assertCompactState("connected");

      await page.route("**/api/stream*", (route) => route.abort());
      await page.reload({ waitUntil: "domcontentloaded" });
      await assertCompactState("reconnecting");

      await page.unroute("**/api/stream*");
      await page.route("**/api/**", (route) => route.abort());
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await assertCompactState("offline");
    });
  }
});
