import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plugin page data path, with fetch stubbed — no test reaches a real
 * API. Covers the client's data_mode header handling and error-envelope
 * mapping, the shop binding's demo-shop default (test dashboard design:
 * a clean browser still auto-selects the demo project), and the load
 * normalization the pages render.
 */

import { createPluginClient } from "../src/lib/plugin/client";
import { DEMO_SHOP_ID, loadShopBinding, demoShopBinding } from "../src/lib/plugin/binding";
import { loadPlugin } from "../src/lib/plugin/load";
import { BUYER_INTENTS, OVERVIEW } from "./plugin-fixtures";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", data_mode: "llm_simulated", ...init.headers },
    ...init,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubStorage();
});

/**
 * The vitest environment is `node` (no jsdom), so the binding tests stub
 * the minimal localStorage surface binding.ts actually touches.
 */
function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      clear: () => void store.clear(),
    },
  });
}

describe("createPluginClient", () => {
  it("returns the payload with the data_mode header the API served", async () => {
    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(OVERVIEW));
    vi.stubGlobal("fetch", fetchStub);

    const client = createPluginClient("/plugin-api");
    const read = await client.overview("shop_solix_demo");

    expect(read.dataMode).toBe("llm_simulated");
    expect(read.payload).toEqual(OVERVIEW);
    expect(fetchStub).toHaveBeenCalledWith("/plugin-api/v1/plugin/shops/shop_solix_demo/overview");
  });

  it("reports provider_measured when that is the served mode", async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(OVERVIEW, { headers: { data_mode: "provider_measured" } }),
    );
    vi.stubGlobal("fetch", fetchStub);

    const read = await createPluginClient("/plugin-api").overview("shop_solix_demo");
    expect(read.dataMode).toBe("provider_measured");
  });

  it("unwraps the intents list route's { shop_id, intents } envelope", async () => {
    // The only enveloped body in the plugin surface (routes.ts): returning
    // the envelope raw would crash the list page on a .map over it.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ shop_id: "shop_solix_demo", intents: [BUYER_INTENTS[0]] })),
    );

    const read = await createPluginClient("/plugin-api").intents("shop_solix_demo");
    expect(read.payload).toEqual([BUYER_INTENTS[0]]);
  });

  it("maps the route's typed 404 envelope onto NotFoundError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { reason: "not_found", detail: "unknown shop id nope" } },
          { status: 404 },
        ),
      ),
    );

    await expect(createPluginClient("/plugin-api").overview("nope")).rejects.toMatchObject({
      name: "NotFoundError",
      status: 404,
      message: expect.stringContaining("unknown shop id nope"),
    });
  });

  it("surfaces a 400 data_mode_mismatch as a typed error carrying the reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { reason: "data_mode_mismatch", detail: "mixed modes are never served" } },
          { status: 400 },
        ),
      ),
    );

    await expect(createPluginClient("/plugin-api").intents("shop_solix_demo")).rejects.toMatchObject({
      name: "UnexpectedStatusError",
      status: 400,
      message: expect.stringContaining("data_mode_mismatch"),
    });
  });
});

describe("shop binding — clean browsers land on the demo shop", () => {
  it("defaults to the demo tenant when nothing is stored", () => {
    const binding = loadShopBinding();
    expect(binding).toEqual(demoShopBinding());
    expect(binding.shopId).toBe("shop_solix_demo");
  });

  it("returns a stored binding verbatim", () => {
    window.localStorage.setItem(
      "iv.plugin.binding",
      JSON.stringify({ shopId: "shop_other", shopDomain: "other.example.com" }),
    );
    expect(loadShopBinding()).toEqual({ shopId: "shop_other", shopDomain: "other.example.com" });
  });

  it("falls back to the demo shop on corrupt storage", () => {
    window.localStorage.setItem("iv.plugin.binding", "{not json");
    expect(loadShopBinding().shopId).toBe(DEMO_SHOP_ID);
  });

  it("falls back when the stored shape is wrong", () => {
    window.localStorage.setItem("iv.plugin.binding", JSON.stringify({ shopId: 42 }));
    expect(loadShopBinding()).toEqual(demoShopBinding());
  });
});

describe("loadPlugin — the pages' error normalization", () => {
  it("passes successful loads through", async () => {
    const result = await loadPlugin(async () => 42);
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it("maps not-found errors to the not_found wording", async () => {
    const { NotFoundError } = await import("@intentvisible/client");
    const result = await loadPlugin(async () => {
      throw new NotFoundError(404, "not_found", {}, "unknown shop id nope");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not_found");
      expect(result.error.message).toContain("demo shop is selected");
    }
  });

  it("maps network failures to the unreachable wording", async () => {
    const result = await loadPlugin(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unavailable");
      expect(result.error.message).toContain("ECONNREFUSED");
    }
  });
});
