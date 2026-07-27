import { expect, test } from "@playwright/test";

// Exercises the AI Learning Coach card (Phase 5.4) against a real
// (non-production) Supabase project. AI is expected to be disabled in this
// environment (no GEMINI_API_KEY / AI_ENABLED configured for E2E), so these
// tests verify the deterministic-fallback path end to end, not a real
// Gemini call. See docs/AI_PLATFORM.md.
const email = process.env.E2E_LEARNER_EMAIL;
const password = process.env.E2E_LEARNER_PASSWORD;
const hasCredentials = Boolean(email && password);

test.describe("AI Learning Coach card", () => {
  test.skip(
    !hasCredentials,
    "Set E2E_LEARNER_EMAIL and E2E_LEARNER_PASSWORD (against a seeded test Supabase project) to run this suite.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email as string);
    await page.getByLabel(/password/i).fill(password as string);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/parent\/dashboard/);
  });

  test("learner dashboard shows the coach card, never an error page", async ({
    page,
  }) => {
    await page.goto("/learner/dashboard");

    await expect(
      page.getByRole("heading", { name: /Today's Coach/ }),
    ).toBeVisible();

    const emptyState = page.getByText(/Complete your first mission/);
    const badge = page.getByText(/AI Generated|System Generated/);
    await expect(emptyState.or(badge)).toBeVisible({ timeout: 10_000 });
  });

  test("parent learner-insights page shows the AI Learning Summary card", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: /view learning insights/i })
      .first()
      .click();
    await page.waitForURL(/\/parent\/learners\//);

    await expect(
      page.getByRole("heading", { name: "AI Learning Summary" }),
    ).toBeVisible();

    const emptyState = page.getByText(/Complete your first mission/);
    const badge = page.getByText(/AI Generated|System Generated/);
    await expect(emptyState.or(badge)).toBeVisible({ timeout: 10_000 });
  });

  test("refresh button re-requests the coaching message without an error page", async ({
    page,
  }) => {
    await page.goto("/learner/dashboard");

    const refreshButton = page.getByRole("button", { name: "Refresh" });
    if (!(await refreshButton.isVisible().catch(() => false))) {
      // Brand-new learner with no mastery data yet — no coach content to refresh.
      return;
    }

    await refreshButton.click();
    await expect(page.getByText(/AI Generated|System Generated/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
