import { expect, test, type Page } from "@playwright/test";

// These tests exercise the authenticated mission-player flow end to end
// against a real (non-production) Supabase project with a seeded question
// bank and a confirmed test parent account. They are skipped unless that
// environment is configured — see docs/PHASE3A_SETUP.md for how to set
// E2E_LEARNER_EMAIL / E2E_LEARNER_PASSWORD alongside real
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY values.
const email = process.env.E2E_LEARNER_EMAIL;
const password = process.env.E2E_LEARNER_PASSWORD;
const hasCredentials = Boolean(email && password);

test.describe("mission player", () => {
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

  async function goToLearnerDashboard(page: Page) {
    await page.goto("/learner/dashboard");
    await page.waitForURL(/\/learner\/dashboard\?learner=/);
  }

  test("starts a mission and shows question 1 of 16", async ({ page }) => {
    await goToLearnerDashboard(page);
    await page
      .getByRole("link", { name: /start mission|resume mission/i })
      .click();
    await page.waitForURL(/\/learner\/mission\?/);
    await expect(page.getByText(/question \d+ of 16/i)).toBeVisible();
  });

  test("submits an answer and reveals feedback and the correct answer", async ({
    page,
  }) => {
    await goToLearnerDashboard(page);
    await page
      .getByRole("link", { name: /start mission|resume mission/i })
      .click();
    await page.waitForURL(/\/learner\/mission\?/);

    const firstOption = page.getByRole("radio").first();
    await firstOption.check();
    await page.getByRole("button", { name: /check answer/i }).click();

    await expect(
      page.getByText(/correct — well done!|try again next time/i),
    ).toBeVisible();
  });

  test("continue advances to the next question", async ({ page }) => {
    await goToLearnerDashboard(page);
    await page
      .getByRole("link", { name: /start mission|resume mission/i })
      .click();
    await page.waitForURL(/\/learner\/mission\?/);

    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /check answer/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText(/question 2 of 16/i)).toBeVisible();
  });

  test("preserves progress after a refresh", async ({ page }) => {
    await goToLearnerDashboard(page);
    await page
      .getByRole("link", { name: /start mission|resume mission/i })
      .click();
    await page.waitForURL(/\/learner\/mission\?/);

    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /check answer/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/question 2 of 16/i)).toBeVisible();

    await page.reload();

    await expect(page.getByText(/question 2 of 16/i)).toBeVisible();
  });

  test("completes the mission and shows the summary screen", async ({
    page,
  }) => {
    await goToLearnerDashboard(page);
    await page
      .getByRole("link", {
        name: /start mission|resume mission|review mission/i,
      })
      .click();
    await page.waitForURL(/\/learner\/mission\?/);

    for (let i = 0; i < 16; i += 1) {
      const heading = page.getByRole("heading", { name: "Mission Complete" });
      if (await heading.isVisible().catch(() => false)) break;

      const options = page.getByRole("radio");
      const optionCount = await options.count();
      if (optionCount === 0) break;

      const submit = page.getByRole("button", {
        name: /check answer|update answer/i,
      });
      if (await submit.isVisible().catch(() => false)) {
        await options.first().check();
        await submit.click();
      }

      const continueButton = page.getByRole("button", { name: /continue/i });
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click();
      }
    }

    await expect(
      page.getByRole("heading", { name: "Mission Complete" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /return to dashboard/i }),
    ).toBeVisible();
  });

  async function completeAllQuestions(page: Page) {
    for (let i = 0; i < 16; i += 1) {
      const heading = page.getByRole("heading", { name: "Mission Complete" });
      if (await heading.isVisible().catch(() => false)) break;

      const options = page.getByRole("radio");
      const optionCount = await options.count();
      if (optionCount === 0) break;

      const submit = page.getByRole("button", {
        name: /check answer|update answer/i,
      });
      if (await submit.isVisible().catch(() => false)) {
        await options.first().check();
        await submit.click();
      }

      const continueButton = page.getByRole("button", { name: /continue/i });
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click();
      }
    }
  }

  test("returns to a dashboard showing the completed state", async ({
    page,
  }) => {
    await goToLearnerDashboard(page);
    await page
      .getByRole("link", {
        name: /start mission|resume mission|review mission/i,
      })
      .click();
    await page.waitForURL(/\/learner\/mission\?/);

    await completeAllQuestions(page);
    await expect(
      page.getByRole("heading", { name: "Mission Complete" }),
    ).toBeVisible();

    await page.getByRole("link", { name: /return to dashboard/i }).click();
    await page.waitForURL(/\/learner\/dashboard\?learner=/);

    await expect(page.getByText(/mission complete/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /review mission/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^resume mission/i }),
    ).not.toBeVisible();
  });

  test("review mistakes shows only incorrect answers, or a perfect score", async ({
    page,
  }) => {
    await goToLearnerDashboard(page);
    await page
      .getByRole("link", {
        name: /start mission|resume mission|review mission/i,
      })
      .click();
    await page.waitForURL(/\/learner\/mission\?/);

    await completeAllQuestions(page);
    await expect(
      page.getByRole("heading", { name: "Mission Complete" }),
    ).toBeVisible();

    await page.getByRole("link", { name: /review mistakes/i }).click();
    await page.waitForURL(/\/learner\/mission\/review\?/);

    const perfectScore = page.getByRole("heading", { name: "Perfect score" });
    const mistakesHeading = page.getByRole("heading", {
      name: "Review Mistakes",
    });
    await expect(mistakesHeading).toBeVisible();

    if (await perfectScore.isVisible().catch(() => false)) {
      await expect(
        page.getByRole("link", { name: /return to dashboard/i }),
      ).toBeVisible();
    } else {
      await expect(page.getByText(/your answer:/i).first()).toBeVisible();
      await expect(page.getByText(/correct answer:/i).first()).toBeVisible();
    }
  });
});
