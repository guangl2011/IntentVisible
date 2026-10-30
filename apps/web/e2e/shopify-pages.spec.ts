import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  BRAND_INTENT,
  INTENT_RECORD,
  INVALIDATED_MAPPING,
  MAPPING,
  PRODUCT,
  STORE_STATUS,
} from "../tests/shopify-fixtures";
import { E2E_PASSCODE } from "./config-url";

/**
 * Merchant dashboard smoke (spec D4): login → overview connect state →
 * catalog sync trigger (mocked job polling) → intents list → approve.
 * Every /shopify-api/* request is answered from the same wire fixtures
 * the component tests use — no Shopify store, no credentials, no
 * Postgres: these pages read only through packages/client.
 */

const JOB_RUNNING = { job_id: "job_sync_2", status: "running" as const };

const SYNC_JOB_COMPLETE = {
  job_id: "job_sync_2",
  kind: "catalog_sync",
  status: "complete" as const,
  created_at: "2026-10-30T01:00:00.000Z",
  updated_at: "2026-10-30T01:00:03.000Z",
  error: null,
  result: { products_synced: 1, pages_stored: 1, per_product_failures: 0 },
};

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Passcode").fill(E2E_PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/queue");
}

test("merchant walks connect → catalog sync → intents → approve", async ({ page }) => {
  let syncPolls = 0;

  await page.route("**/shopify-api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/shopify-api/, "");
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/v1/install" && route.request().method() === "POST") {
      return respond({ store_id: STORE_STATUS.store_id, install_url: "https://example.test/oauth" });
    }
    if (path === `/v1/stores/${STORE_STATUS.store_id}` && route.request().method() === "GET") {
      return respond(STORE_STATUS);
    }
    if (path === `/v1/stores/${STORE_STATUS.store_id}/sync` && route.request().method() === "POST") {
      return respond(JOB_RUNNING, 202);
    }
    if (path.startsWith("/v1/jobs/")) {
      syncPolls += 1;
      // First poll still running, then complete — proves the UI polls.
      return respond(syncPolls === 1 ? { ...SYNC_JOB_COMPLETE, status: "running", result: null } : SYNC_JOB_COMPLETE);
    }
    if (path === `/v1/stores/${STORE_STATUS.store_id}/products`) {
      return respond({ store_id: STORE_STATUS.store_id, products: [PRODUCT] });
    }
    if (path === `/v1/stores/${STORE_STATUS.store_id}/intents`) {
      return respond({ store_id: STORE_STATUS.store_id, intents: [INTENT_RECORD, BRAND_INTENT] });
    }
    if (path === `/v1/stores/${STORE_STATUS.store_id}/mappings`) {
      return respond({ store_id: STORE_STATUS.store_id, mappings: [MAPPING, INVALIDATED_MAPPING] });
    }
    return respond({ error: { code: "not_found", message: `unexpected ${path}` } }, 404);
  });

  await login(page);

  // ── Overview: unbound first, connect card resolves a store id ──────────
  await page.goto("/shopify");
  await expect(page.getByText("Connect your Shopify store")).toBeVisible();
  await page.getByLabel("Store").fill(STORE_STATUS.store_id);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("acme-fixtures.myshopify.com").first()).toBeVisible();
  await expect(page.getByText("Library intents")).toBeVisible();

  // ── Catalog: sync trigger with running→complete job polling ───────────
  await page.goto("/shopify/catalog");
  await expect(page.getByText("SunBeam 1000 Portable Power Station")).toBeVisible();
  await page.getByRole("button", { name: "Sync catalog" }).click();
  // The mocked job completes on the second poll; the completed result line
  // proves the UI polled the job to its terminal state.
  await expect(page.getByText("1 products, 1 pages")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /complete/ })).toBeVisible();

  // ── Intents: library list renders fixture records ─────────────────────
  await page.goto("/shopify/intents");
  await expect(page.getByText("LiFePO4 battery runtime", { exact: true })).toBeVisible();
  await expect(page.getByText("Best LiFePO4 power stations", { exact: true })).toBeVisible();

  // ── Approve: local review state flips the card chip ────────────────────
  await page.getByRole("button", { name: "Approve" }).first().click();
  const firstCard = page.locator(".intent-card", {
    hasText: "LiFePO4 battery runtime",
  });
  await expect(firstCard.locator(".badge-APPROVED")).toBeVisible();
  await expect(firstCard.getByRole("button", { name: "Approve" })).toHaveCount(0);
});
