import { expect, test } from "@playwright/test";
import { E2E_PASSCODE } from "./config-url";

/**
 * Root-route smoke: the hosted proxy follows redirects internally, so `/`
 * must serve the login page via a middleware rewrite (HTTP 200 at URL `/`),
 * not a server redirect — otherwise the login Server Action POSTs to `/`
 * and gets swallowed. Assert the passcode form renders at `/` and that
 * signing in from it lands on the queue.
 */
test("root URL serves the passcode form and login lands on the queue", async ({
  page,
}) => {
  await page.goto("/");

  expect(page.url()).toBe("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: "IntentVisible" })).toBeVisible();
  await expect(page.getByLabel("Passcode")).toBeVisible();

  await page.getByLabel("Passcode").fill(E2E_PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/queue");
});
