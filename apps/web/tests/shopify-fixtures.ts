import type {
  IntentRecord,
  MappingListItem,
  ProductListItem,
  StoreStatus,
} from "@intentvisible/client";

/**
 * Typed wire-contract fixtures for the merchant page tests — the same
 * shapes the API's routes serve (validated records on the wire). Being
 * statically typed means a missing required field is a compile error.
 */

const SCHEMA_VERSION = "1.0.0";

export const INTENT_RECORD: IntentRecord = {
  schema_version: SCHEMA_VERSION,
  intent_id: "int_lifepo4_battery_runtime",
  intent_version: 1,
  scope: "product",
  brand_id: "brand_acme_fixtures",
  intent_name: "LiFePO4 battery runtime",
  buyer_stage: "Consideration",
  intent_category: "Feature",
  country: "US",
  language: "en",
  prompts: [
    "how long does a 993wh lifepo4 power station run a fridge",
    "993wh lifepo4 battery runtime camping",
  ],
  sku_ids: ["sku_111000111"],
  evidence_urls: ["https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station"],
  generation_method: "deterministic_extraction",
  measurement_status: "not_measured",
  measurement_source: null,
  visibility_pct: null,
  monthly_search_volume: null,
  confidence: "medium",
};

export const BRAND_INTENT: IntentRecord = {
  ...INTENT_RECORD,
  intent_id: "int_best_lifepo4_power_stations",
  scope: "brand",
  intent_name: "Best LiFePO4 power stations",
  intent_category: "Category Question",
  buyer_stage: "Awareness",
  prompts: ["best lifepo4 portable power stations"],
  sku_ids: [],
};

export const PRODUCT: ProductListItem = {
  schema_version: SCHEMA_VERSION,
  product_id: "product_98765432100",
  brand_id: "brand_acme_fixtures",
  name: "SunBeam 1000 Portable Power Station",
  url: "https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station",
  description: "A 993Wh LiFePO4 portable power station with a 1000W pure sine AC inverter.",
  features: ["993Wh LiFePO4 battery capacity", "1000W pure sine AC inverter"],
  specifications: [],
  use_cases: [],
  compatibility: [],
  skus: [
    {
      sku_id: "sku_111000111",
      name: "Standard",
      price: { amount: 999, currency: "USD" },
    },
  ],
  evidence_urls: ["https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station"],
  snapshot_refs: [
    {
      url: "https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station",
      content_hash: "fixture-hash-sunbeam-1000",
      fetched_at: "2026-10-30T00:00:00.000Z",
      storage_ref: "fixture/snapshots/sunbeam-1000.json",
    },
  ],
  generation_method: "deterministic_extraction",
  generated_at: "2026-10-30T00:00:00.000Z",
  deleted_at: null,
};

export const DELETED_PRODUCT: ProductListItem = {
  ...PRODUCT,
  product_id: "product_98765432101",
  name: "Discontinued Camp Stove",
  deleted_at: "2026-10-29T00:00:00.000Z",
};

export const MAPPING: MappingListItem = {
  schema_version: SCHEMA_VERSION,
  mapping_id: "map_111000111_lifepo4",
  intent_id: "int_lifepo4_battery_runtime",
  sku_id: "sku_111000111",
  product_id: "product_98765432100",
  match_strength: 0.95,
  eligibility: "unverified",
  landing_url: "https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station",
  evidence_urls: ["https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station"],
  active: true,
  invalidated_at: null,
};

export const INVALIDATED_MAPPING: MappingListItem = {
  ...MAPPING,
  mapping_id: "map_222000111_stale",
  intent_id: "int_best_lifepo4_power_stations",
  sku_id: "sku_222000111",
  active: false,
  invalidated_at: "2026-10-30T00:00:00.000Z",
};

export const STORE_STATUS: StoreStatus = {
  store_id: "store_acme_fixtures",
  shop_domain: "acme-fixtures.myshopify.com",
  connected: true,
  granted_scopes: ["read_products", "read_online_store_pages"],
  product_count: 2,
  intent_count: 2,
  mapping_count: 2,
  last_sync: {
    job_id: "job_sync_1",
    kind: "catalog_sync",
    status: "complete",
    created_at: "2026-10-30T00:00:00.000Z",
    updated_at: "2026-10-30T00:00:01.000Z",
    error: null,
    result: { products_synced: 2, pages_stored: 2, per_product_failures: 0 },
  },
  last_generation: {
    job_id: "job_gen_1",
    kind: "intent_generation",
    status: "complete",
    created_at: "2026-10-30T00:01:00.000Z",
    updated_at: "2026-10-30T00:01:02.000Z",
    error: null,
    result: {
      brand_intents: 0,
      product_intents: 2,
      intents_created: 2,
      mappings_created: 2,
      library_intents: 2,
      library_mappings: 2,
    },
  },
};
