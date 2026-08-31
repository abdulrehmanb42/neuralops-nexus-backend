import { expect, test } from "@playwright/test";

test("landing page presents the product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/digital workforce/i);
  await expect(page.getByRole("link", { name: "Get started" }).first()).toBeVisible();
});

test("Get started leads to sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
});

test("servers and workspace are guarded for signed-out visitors", async ({ page }) => {
  await page.goto("/servers");
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  await page.goto("/w");
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
});

test("landing is responsive at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
