import { expect, test } from "@playwright/test";

test("renders the SSR bootstrap home page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Mis Finanzas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Conectar Google" }),
  ).toBeVisible();
});
