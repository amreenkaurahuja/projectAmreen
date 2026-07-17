import { expect, test } from "@playwright/test";

test("Phase 0 home page is available", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Project Amreen" }),
  ).toBeVisible();
  await expect(page.getByText("Supabase SSR client boundary")).toBeVisible();
});

test("health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});
