import { expect, test } from "@playwright/test";
import { E2E_PASSCODE } from "./config-url";

/**
 * Root-route smoke: the hosted proxy follows redirects internally, so `/`
 * must serve the login page via a middleware rewrite (HTTP 200 at URL `/`),
 * not a server redirect — otherwise the login Server Action POSTs to `/`
 * and gets swallowed. Assert the passcode form renders at `/` and that
 * signing in from it lands on the plugin.
 */
test("root URL serves the passcode form and login lands on the plugin", async ({
  page,
}) => {
  await page.goto("/");

  expect(page.url()).toBe("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: "IntentVisible" })).toBeVisible();
  await expect(page.getByLabel("Passcode")).toBeVisible();

  await page.getByLabel("Passcode").fill(E2E_PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/plugin");
});

/**
 * Proxied-login regression: behind the hosted proxy, x-forwarded-host is the
 * internal upstream host while the browser origin stays the public URL, and
 * Next.js Server Actions abort that mismatch. Simulate it here by injecting
 * a mismatched x-forwarded-host onto every request (the browser origin stays
 * http://localhost:3000). The middleware must reconcile the headers on the
 * login POST to / — otherwise the sign-in click fails with "Invalid Server
 * Actions request" exactly as it does on hosted.
 */
test("login works when forwarded headers mismatch the origin, like the hosted proxy", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-forwarded-host": "3000-id5offrwj3hj3mibwwjui.e2b.app",
      },
    });
  });

  await page.goto("/");

  await page.getByLabel("Passcode").fill(E2E_PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/plugin");
});
