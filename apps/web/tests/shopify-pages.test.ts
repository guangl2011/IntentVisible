import { NotFoundError } from "@intentvisible/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadBinding, parseBindingInput, resolveBinding, saveBinding } from "../src/lib/shopify/binding";
import { loadPage } from "../src/lib/shopify/loaders";
import { approveIntent, editPrompts, reviewChipFor } from "../src/lib/shopify/review";
import type { ShopifyClient } from "@intentvisible/client";
import type { IntentReviews } from "../src/lib/shopify/review";
import { INTENT_RECORD, PRODUCT } from "./shopify-fixtures";

/**
 * Container-side logic with the packages/client data path mocked —
 * per the task, component tests mock client responses rather than
 * touching a server. The mock replaces the whole client module, so no
 * test here can reach a real API.
 */

vi.mock("../src/lib/shopify/client", async () => {
  const { NotFoundError } = await import("@intentvisible/client");
  return {
    getShopifyClient: vi.fn(),
    NotFoundError,
  };
});

import { getShopifyClient } from "../src/lib/shopify/client";

const mockedGet = vi.mocked(getShopifyClient);

/** Stub covering the ShopifyClient surface; tests override what they exercise. */
function fakeClient(overrides: Partial<ShopifyClient> = {}): ShopifyClient {
  return {
    beginInstall: vi.fn(),
    storeStatus: vi.fn(),
    triggerSync: vi.fn(),
    triggerGeneration: vi.fn(),
    listProducts: vi.fn(),
    listIntents: vi.fn(),
    listMappings: vi.fn(),
    job: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("parseBindingInput", () => {
  it("accepts a myshopify domain", () => {
    expect(parseBindingInput("acme-fixtures.myshopify.com")).toEqual({
      kind: "shop_domain",
      shop: "acme-fixtures.myshopify.com",
    });
  });

  it("accepts a bare store id", () => {
    expect(parseBindingInput("store_acme_fixtures")).toEqual({
      kind: "store_id",
      id: "store_acme_fixtures",
    });
  });

  it("rejects input that is neither", () => {
    expect(parseBindingInput("   ")).toEqual({ kind: "invalid" });
  });
});

describe("resolveBinding", () => {
  it("verifies a store id against the status read before binding", async () => {
    const client = fakeClient({
      storeStatus: vi.fn().mockResolvedValue({
        store_id: "store_acme_fixtures",
        shop_domain: "acme-fixtures.myshopify.com",
      }),
    });
    mockedGet.mockReturnValue(client);

    const result = await resolveBinding("store_acme_fixtures");
    expect(result).toEqual({
      ok: true,
      data: { storeId: "store_acme_fixtures", shopDomain: "acme-fixtures.myshopify.com" },
    });
    expect(client.storeStatus).toHaveBeenCalledWith("store_acme_fixtures");
  });

  it("starts an install for a myshopify domain", async () => {
    const client = fakeClient({
      beginInstall: vi.fn().mockResolvedValue({
        store_id: "store_acme_fixtures",
        install_url: "https://accounts.shopify.com/oauth/authorize?...",
      }),
    });
    mockedGet.mockReturnValue(client);

    const result = await resolveBinding("acme-fixtures.myshopify.com");
    expect(result).toEqual({
      ok: true,
      data: { storeId: "store_acme_fixtures", shopDomain: "acme-fixtures.myshopify.com" },
    });
    expect(client.beginInstall).toHaveBeenCalledWith("acme-fixtures.myshopify.com");
  });

  it("maps NotFoundError to the not_found error without binding", async () => {
    const client = fakeClient({
      storeStatus: vi.fn().mockRejectedValue(
        new NotFoundError(404, "not_found", null, "No store matches that id."),
      ),
    });
    mockedGet.mockReturnValue(client);

    const result = await resolveBinding("store_nope");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.kind).toBe("not_found");
  });

  it("maps unexpected rejections to the unavailable error", async () => {
    const client = fakeClient({
      storeStatus: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    });
    mockedGet.mockReturnValue(client);

    const result = await resolveBinding("store_acme_fixtures");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.kind).toBe("unavailable");
  });
});

describe("loadPage", () => {
  it("returns the fetched data", async () => {
    const page = await loadPage(async () => [PRODUCT]);
    expect(page).toEqual({ ok: true, data: [PRODUCT] });
  });

  it("maps NotFoundError to the not_found state", async () => {
    const page = await loadPage(async () => {
      throw new NotFoundError(404, "not_found", null, "No store matches that id.");
    });
    expect(page.ok === false && page.error.kind).toBe("not_found");
  });

  it("maps any other rejection to the unavailable state", async () => {
    const page = await loadPage(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(page.ok === false && page.error.kind).toBe("unavailable");
  });
});

describe("binding storage without a window", () => {
  it("loadBinding reads null on the server side", () => {
    expect(loadBinding()).toBeNull();
  });

  it("saveBinding fails closed outside the browser", () => {
    expect(() => saveBinding({ storeId: "s", shopDomain: "x.myshopify.com" })).toThrow();
  });
});

describe("review state", () => {
  it("approveIntent marks the record approved without mutating the input", () => {
    const state: IntentReviews = { approved: [], editedPrompts: {} };
    const next = approveIntent(state, INTENT_RECORD.intent_id);
    expect(reviewChipFor(next, INTENT_RECORD.intent_id)).toBe("approved");
    expect(reviewChipFor(state, INTENT_RECORD.intent_id)).toBe("none");
  });

  it("editPrompts replaces the prompts for that record only", () => {
    const state: IntentReviews = { approved: [], editedPrompts: {} };
    const next = editPrompts(state, INTENT_RECORD.intent_id, [
      "how long does a 993wh lifepo4 power station run a cpap",
    ]);
    expect(next.editedPrompts[INTENT_RECORD.intent_id]).toEqual([
      "how long does a 993wh lifepo4 power station run a cpap",
    ]);
    expect(state.editedPrompts[INTENT_RECORD.intent_id]).toBeUndefined();
    expect(reviewChipFor(next, INTENT_RECORD.intent_id)).toBe("edited");
  });

  it("an approved intent keeps its chip even after later prompt edits", () => {
    const approved = approveIntent(
      { approved: [], editedPrompts: {} } satisfies IntentReviews,
      INTENT_RECORD.intent_id,
    );
    const edited = editPrompts(approved, INTENT_RECORD.intent_id, ["reworded"]);
    expect(reviewChipFor(edited, INTENT_RECORD.intent_id)).toBe("approved");
  });
});
