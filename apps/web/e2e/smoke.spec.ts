import { expect, test } from "@playwright/test";

// Smoke placeholder: the real E2E flow (create agent → declare → approve →
// outcome → history) is built by the E2E subtask once the API and dashboard exist.
test("home page redirects to the login page", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login");
  await expect(page.getByRole("heading", { name: "IntentVisible" })).toBeVisible();
});
