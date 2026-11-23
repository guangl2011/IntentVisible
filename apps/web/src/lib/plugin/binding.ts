/**
 * Which plugin shop the plugin pages operate on. Follows the pipeline/
 * Shopify binding pattern — picked at onboarding and remembered in
 * localStorage — with one plugin-specific rule from the test dashboard
 * design: a clean browser with no stored binding still auto-selects the
 * demo project, so the deterministic fixture seed is always reachable.
 *
 * The demo tenant id is declared here rather than imported from
 * plugin-schema: that package is the API side (drizzle/libsql) and web
 * does not depend on it. `packages/plugin-schema/src/seed.ts` (DEMO_SHOP_ID)
 * stays the source of truth; tests assert the two agree.
 */

export interface ShopBinding {
  shopId: string;
  shopDomain: string;
}

const BINDING_KEY = "iv.plugin.binding";

/** The demo tenant the fixture server seeds — mirror of plugin-schema's DEMO_SHOP_ID. */
export const DEMO_SHOP_ID = "shop_solix_demo";

/** The demo tenant binding, used whenever no stored binding exists. */
export function demoShopBinding(): ShopBinding {
  return { shopId: DEMO_SHOP_ID, shopDomain: "solix-demo.myshopify.com" };
}

export function loadShopBinding(): ShopBinding {
  if (typeof window === "undefined") {
    return demoShopBinding();
  }
  try {
    const raw = window.localStorage.getItem(BINDING_KEY);
    if (raw === null) {
      return demoShopBinding();
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ShopBinding).shopId === "string" &&
      typeof (parsed as ShopBinding).shopDomain === "string"
    ) {
      return parsed as ShopBinding;
    }
    return demoShopBinding();
  } catch {
    return demoShopBinding();
  }
}
