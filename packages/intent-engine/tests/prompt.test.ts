import { describe, expect, it } from "vitest";

import {
  BRAND_INTENT_CATEGORIES,
  PRODUCT_INTENT_CATEGORIES,
  buildBrandPrompt,
  buildProductPrompt,
  intentSystemPrompt,
} from "../src/prompt.js";
import { BRAND, DOMAIN, PDP_URL, PRODUCT, SNAPSHOT, SPECS_URL } from "./fixtures.js";

describe("intentSystemPrompt", () => {
  it("demands evidence-first claims, registry-only citations, and no measured metrics", () => {
    const prompt = intentSystemPrompt(BRAND_INTENT_CATEGORIES);
    expect(prompt).toContain("Evidence-first");
    expect(prompt).toContain("subset of the evidence registry");
    expect(prompt).toContain("never invent, estimate, or guess");
    expect(prompt).toContain("JSON array");
  });

  it("names the requested categories", () => {
    const prompt = intentSystemPrompt(PRODUCT_INTENT_CATEGORIES);
    expect(prompt).toContain(PRODUCT_INTENT_CATEGORIES.join(", "));
  });
});

describe("buildBrandPrompt", () => {
  it("supplies the brand evidence and the evidence registry", () => {
    const prompt = buildBrandPrompt(BRAND, { country: "AU", language: "en" }, [PDP_URL]);
    expect(prompt.system).toContain("JSON array");
    expect(prompt.user).toContain("ExampleBrand");
    expect(prompt.user).toContain("RivalOne");
    expect(prompt.user).toContain(PDP_URL);
    // The registry is the only citable source and brand scope has no SKUs.
    expect(prompt.user).toContain("ONLY URLs you may cite");
    expect(prompt.user).toContain("sku_ids must be []");
  });

  it("instructs per-market language for the target market", () => {
    const prompt = buildBrandPrompt(BRAND, { country: "DE", language: "de" }, [PDP_URL]);
    expect(prompt.user).toContain("country=DE, language=de");
    // Node ICU reports German by endonym.
    expect(prompt.user).toContain("Deutsch (de)");
    expect(prompt.market).toEqual({ country: "DE", language: "de" });
  });

  it("falls back to the raw code when ICU lacks the language", () => {
    const prompt = buildBrandPrompt(BRAND, { country: "DE", language: "xx" }, [PDP_URL]);
    expect(prompt.user).toContain("language=xx");
  });
});

describe("buildProductPrompt", () => {
  it("supplies product evidence, the registry, and the SKU allowlist", () => {
    const prompt = buildProductPrompt(PRODUCT, { country: "AU", language: "en" }, [
      PDP_URL,
      SPECS_URL,
    ]);
    expect(prompt.user).toContain("ExampleBrand 1000 Portable Power Station");
    expect(prompt.user).toContain("sku_example_01");
    expect(prompt.user).toContain("sku_example_02");
    expect(prompt.user).toContain(PDP_URL);
    expect(prompt.user).toContain(SPECS_URL);
    expect(prompt.user).toContain("Feature");
  });

  it("handles products without evidenced SKUs", () => {
    const noSkuProduct = { ...PRODUCT, skus: [] };
    const prompt = buildProductPrompt(noSkuProduct, { country: "AU", language: "en" }, [PDP_URL]);
    expect(prompt.user).toContain("No variant SKUs are evidenced");
  });

  it("references the product URL from the profile", () => {
    const prompt = buildProductPrompt(PRODUCT, { country: "AU", language: "en" }, [
      SNAPSHOT.url,
    ]);
    expect(prompt.user).toContain(PRODUCT.url);
    expect(DOMAIN).toBeTruthy(); // fixture sanity
  });
});
