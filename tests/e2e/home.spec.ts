import { expect, test } from "@playwright/test";

test("home page is available", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A private, adaptive learning foundation built one reliable phase at a time.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create parent account" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});
