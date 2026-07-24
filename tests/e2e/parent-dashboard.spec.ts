import { expect, test } from "@playwright/test";

// Exercises the Parent Intelligence Dashboard (Phase 5.3) against a real
// (non-production) Supabase project with a seeded question bank and a
// confirmed test parent account. Skipped unless that environment is
// configured — see docs/PHASE3A_SETUP.md for E2E_LEARNER_EMAIL /
// E2E_LEARNER_PASSWORD.
const email = process.env.E2E_LEARNER_EMAIL;
const password = process.env.E2E_LEARNER_PASSWORD;
const hasCredentials = Boolean(email && password);

test.describe("parent intelligence dashboard", () => {
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

  test("loads learning insights from the parent dashboard learner list", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: /view learning insights/i })
      .first()
      .click();

    await page.waitForURL(/\/parent\/learners\//);
    await expect(
      page.getByRole("heading", { name: "Overall Learning Health" }),
    ).toBeVisible();
  });

  test("shows either recommendations or the empty-state message", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: /view learning insights/i })
      .first()
      .click();
    await page.waitForURL(/\/parent\/learners\//);

    const recommendationsHeading = page.getByRole("heading", {
      name: "Recommendations",
    });
    const emptyState = page.getByText(
      "Complete your first mission to start building learning insights.",
    );

    await expect(recommendationsHeading.or(emptyState)).toBeVisible();
  });

  test("shows session history or its empty state", async ({ page }) => {
    await page
      .getByRole("link", { name: /view learning insights/i })
      .first()
      .click();
    await page.waitForURL(/\/parent\/learners\//);

    const emptyState = page.getByText(
      "Complete your first mission to start building learning insights.",
    );
    if (await emptyState.isVisible().catch(() => false)) {
      return;
    }

    await expect(
      page.getByRole("heading", { name: "Session history" }),
    ).toBeVisible();
  });

  test("renders without horizontal overflow at a mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page
      .getByRole("link", { name: /view learning insights/i })
      .first()
      .click();
    await page.waitForURL(/\/parent\/learners\//);

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
