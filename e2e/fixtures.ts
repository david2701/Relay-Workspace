import {
  expect,
  test as base,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";

export type { APIRequestContext, Locator, Page, Request };

/**
 * Shared Playwright webServer (ports from env / playwright.config).
 * Specs that spawn their own API+web (unpaired_token_auth) must set
 * `test.use({ isolateSharedServer: false })`.
 */
export const E2E_API =
  process.env.E2E_API_URL ??
  process.env.VITE_API_URL ??
  "http://127.0.0.1:7430";
export const E2E_WEB =
  process.env.E2E_WEB_URL ?? "http://127.0.0.1:7431";
export const E2E_DB = process.env.RELAY_DB ?? "/tmp/relay-e2e-w0.db";

export type E2eResetResult = {
  ok: boolean;
  seq: number;
  work_item_count: number;
  sse_clients: number;
  settings: { onboarding_completed_at: string | null };
};

/** Reseed demo baseline + drop every SSE client on the shared server. */
export async function resetSharedE2e(
  request: APIRequestContext,
  locale: "en" | "fr" | "es" = "en",
): Promise<E2eResetResult> {
  const res = await request.post(`${E2E_API}/api/store/e2e-reset`, {
    data: { locale },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as E2eResetResult;
  expect(body.ok).toBe(true);
  expect(body.sse_clients).toBe(0);
  expect(body.settings.onboarding_completed_at).toBeTruthy();
  return body;
}

/** Current item_events head — read before acting so cursors stay stable. */
export async function readHeadSeq(
  request: APIRequestContext,
): Promise<number> {
  const res = await request.get(`${E2E_API}/api/inbox?view=all&limit=1`);
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { seq?: number };
  expect(typeof body.seq).toBe("number");
  return body.seq ?? 0;
}

type Fixtures = {
  /**
   * When true (default), POST /api/store/e2e-reset before each test so the
   * shared webServer DB + SSE hub cannot leak state across specs.
   */
  isolateSharedServer: boolean;
};

export const test = base.extend<Fixtures>({
  isolateSharedServer: [true, { option: true }],
  // Auto fixture: isolate before each test. Previous test's `page` fixture
  // tears down first (EventSource.close); this then drops any hub leftovers
  // and reseeds so specs cannot observe each other's DB / seq / SSE state.
  _e2eIsolate: [
    async ({ request, isolateSharedServer }, use) => {
      if (isolateSharedServer) {
        await resetSharedE2e(request);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
