/**
 * Golden-corpus dedup and invariant tests (task acceptance).
 *
 * Paraphrase-pair dedup over the golden corpus: the Solix sample's own
 * paraphrase pair — "S2000 vs Rivals" asked two different ways — must
 * collapse onto one intent_id with a version bump, and distinct intents
 * must keep distinct ids. A property pass over a full two-market run
 * then checks that every generated record cites at least one stored
 * snapshot and carries the standalone measurement nulls.
 *
 * The corpus rows mirror packages/intent-importer/fixture/solix-sample.csv
 * as the importer emits them (measurement_status "imported" keeps its
 * measured values). The engine must not depend on the importer package —
 * the dependency runs the other way (the API layer consumes both) — so the
 * rows are reconstructed here, with identity re-pointed at this suite's
 * brand/product fixtures.
 */
import { IntentRecordSchema, type IntentRecord } from "@intentvisible/core-schema";
import { describe, expect, it } from "vitest";

import { dedupDrafts, summaryOf, type ExistingIntentSummary } from "../src/dedup.js";
import { IntentGenerator } from "../src/generate.js";
import { FakeClock, ScriptedAdapter } from "./test-doubles.js";
import {
  AU_MARKET,
  BRAND,
  PDP_URL,
  PRODUCT,
  SNAPSHOT,
  SPECS_URL,
  baseCandidate,
  candidatesJson,
} from "./fixtures.js";

const MEASURED_SOURCE = "Visible GEO panel";

interface CorpusRow {
  intent_id: string;
  scope: "brand" | "product";
  country: "AU" | "US";
  buyer_stage: "Comparison" | "Consideration" | "Solution Research";
  intent_category: "Comparison" | "Risk & Trust" | "Technical" | "Scenario";
  intent_name: string;
  prompt: string;
  evidence_url: string;
  sku_ids: string[];
  visibility_pct: number | null;
  monthly_search_volume: number | null;
}

/** Rows 1–4 of packages/intent-importer/fixture/solix-sample.csv, verbatim content. */
const CORPUS_ROWS: CorpusRow[] = [
  {
    intent_id: "int_s2000_vs_rivals",
    scope: "product",
    country: "AU",
    buyer_stage: "Comparison",
    intent_category: "Comparison",
    intent_name: "S2000 vs Rivals",
    prompt: "How does the Solix S2000 compare to EcoFlow and Jackery rivals?",
    evidence_url: "https://www.example.com/compare/s2000-vs-rivals",
    sku_ids: ["sku_example_01", "sku_example_02"],
    visibility_pct: 12.5,
    monthly_search_volume: 840,
  },
  {
    intent_id: "int_long_term_durability",
    scope: "product",
    country: "AU",
    buyer_stage: "Consideration",
    intent_category: "Risk & Trust",
    intent_name: "Long-Term Durability",
    prompt: "Is the Solix S2000 durable enough for years of camping trips?",
    evidence_url: "https://www.example.com/products/s2000",
    sku_ids: ["sku_example_01"],
    visibility_pct: 8.0,
    monthly_search_volume: 610,
  },
  {
    intent_id: "int_how_long_fridge",
    scope: "product",
    country: "AU",
    buyer_stage: "Solution Research",
    intent_category: "Technical",
    intent_name: "How Long Fridge",
    prompt: "How long can the Solix S2000 run a 12V camping fridge?",
    evidence_url: "https://www.example.com/products/s2000#specs",
    sku_ids: ["sku_example_01", "sku_example_02"],
    visibility_pct: 15.2,
    monthly_search_volume: 1220,
  },
  {
    intent_id: "int_camping_power_rec",
    scope: "brand",
    country: "US",
    buyer_stage: "Solution Research",
    intent_category: "Scenario",
    intent_name: "Camping Power Rec",
    prompt: "Which power station should I take on an overnight camping trip?",
    evidence_url: "https://www.example.com/camping-power",
    sku_ids: [],
    visibility_pct: null,
    monthly_search_volume: null,
  },
];

/** Builds one importer-style record from a corpus row. */
function corpusRecord(row: CorpusRow): IntentRecord {
  return IntentRecordSchema.parse({
    schema_version: "1.0.0",
    intent_id: row.intent_id,
    intent_version: 1,
    scope: row.scope,
    brand_id: BRAND.brand_id,
    intent_name: row.intent_name,
    buyer_stage: row.buyer_stage,
    intent_category: row.intent_category,
    country: row.country,
    language: "en",
    prompts: [row.prompt],
    sku_ids: row.sku_ids,
    evidence_urls: [row.evidence_url],
    generation_method: "imported",
    measurement_status: "imported",
    measurement_source: row.visibility_pct === null ? null : MEASURED_SOURCE,
    visibility_pct: row.visibility_pct,
    monthly_search_volume: row.monthly_search_volume,
    opportunity_type: "hypothesis",
    confidence: "medium",
  });
}

const CORPUS: ExistingIntentSummary[] = CORPUS_ROWS.map((row) => corpusRecord(row)).map((record) =>
  summaryOf(record),
);

function productRun(overrides: Record<string, unknown> = {}) {
  return {
    markets: [AU_MARKET],
    snapshots: [SNAPSHOT, { ...SNAPSHOT, url: SPECS_URL }],
    retry: { max_attempts: 3, base_delay_ms: 1, max_delay_ms: 4 },
    ...overrides,
  };
}

describe("golden-corpus paraphrase dedup", () => {
  it("collapses the corpus paraphrase pair onto one intent_id with a version bump", async () => {
    // The corpus stores "S2000 vs Rivals" asked one way (row 1); a new
    // generation rewords it (row 5's prompt) — the same intent, new wording.
    const generator = new IntentGenerator({
      adapter: new ScriptedAdapter([
        candidatesJson([
          baseCandidate({
            intent_name: "S2000 vs Rivals",
            topic: "s2000 vs rivals",
            intent_category: "Comparison",
            buyer_stage: "Comparison",
            prompts: ["Is the S2000 better than the EcoFlow Delta 2 for overlanding?"],
          }),
        ]),
      ]),
      clock: new FakeClock(),
    });

    const outcome = await generator.generateProductIntents(PRODUCT, productRun({ existing: CORPUS }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records).toHaveLength(1);
    expect(outcome.records[0]?.intent_id).toBe("int_s2000_vs_rivals");
    expect(outcome.records[0]?.intent_version).toBe(2);
    // The reworded record carries the NEW wording, not the stored one.
    expect(outcome.records[0]?.prompts).toEqual([
      "Is the S2000 better than the EcoFlow Delta 2 for overlanding?",
    ]);
    expect(outcome.report.reused).toBe(1);
    expect(outcome.report.fresh).toBe(0);
  });

  it("keeps distinct corpus intents distinct — no cross-merging by keyword", async () => {
    const generator = new IntentGenerator({
      adapter: new ScriptedAdapter([
        candidatesJson([
          baseCandidate({
            intent_name: "Battery Longevity Doubts",
            intent_category: "Risk & Trust",
            prompts: ["Will the battery degrade after two summers of use?"],
          }),
          baseCandidate({
            intent_name: "Weekend Trip Sizing",
            intent_category: "Scenario",
            prompts: ["How much capacity does a weekend trip need?"],
          }),
        ]),
      ]),
      clock: new FakeClock(),
    });

    const outcome = await generator.generateProductIntents(PRODUCT, productRun({ existing: CORPUS }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const ids = outcome.records.map((record) => record.intent_id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("int_long_term_durability");
    expect(ids).not.toContain("int_how_long_fridge");
    expect(outcome.report.fresh).toBe(2);
  });

  it("dedups reworded drafts against the corpus at the unit level too", () => {
    const draft = {
      ...baseCandidate({
        intent_name: "S2000 vs Rivals",
        intent_category: "Comparison",
        prompts: ["Is the S2000 better than the EcoFlow Delta 2 for overlanding?"],
      }),
      scope: "product" as const,
      brand_id: BRAND.brand_id,
      country: "AU" as const,
      language: "en" as const,
    };
    const dedup = dedupDrafts([draft], CORPUS);
    expect(dedup.assigned[0]?.intent_id).toBe("int_s2000_vs_rivals");
    expect(dedup.assigned[0]?.intent_version).toBe(2);
    expect(dedup.assigned[0]?.reused).toBe(true);
  });
});

describe("golden-corpus run properties (two markets)", () => {
  it("every generated record cites at least one stored snapshot", async () => {
    const generator = new IntentGenerator({
      adapter: new ScriptedAdapter([
        candidatesJson([
          baseCandidate(),
          baseCandidate({ intent_name: "Solar Charging", intent_category: "Price" }),
        ]),
        candidatesJson([
          baseCandidate({
            intent_name: "Kühlschrank Laufzeit",
            prompts: ["Wie lange läuft ein Kühlschrank beim Campen?"],
          }),
        ]),
      ]),
      clock: new FakeClock(),
    });
    const storedUrls = new Set([SNAPSHOT.url, SPECS_URL, PDP_URL]);

    const outcome = await generator.generateProductIntents(
      PRODUCT,
      productRun({ markets: [AU_MARKET, { ...AU_MARKET, country: "DE", language: "de" }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records.length).toBeGreaterThanOrEqual(3);
    for (const record of outcome.records) {
      expect(record.evidence_urls.length).toBeGreaterThanOrEqual(1);
      for (const url of record.evidence_urls) {
        expect(storedUrls.has(url)).toBe(true);
      }
    }
  });

  it("no generated record carries a measured value", async () => {
    const generator = new IntentGenerator({
      adapter: new ScriptedAdapter([
        candidatesJson([baseCandidate()]),
        candidatesJson([
          baseCandidate({
            intent_name: "Kühlschrank Laufzeit",
            prompts: ["Wie lange läuft ein Kühlschrank beim Campen?"],
          }),
        ]),
      ]),
      clock: new FakeClock(),
    });

    const outcome = await generator.generateProductIntents(
      PRODUCT,
      productRun({ markets: [AU_MARKET, { ...AU_MARKET, country: "DE", language: "de" }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const record of outcome.records) {
      expect(record.measurement_status).toBe("not_measured");
      expect(record.measurement_source).toBeNull();
      expect(record.visibility_pct).toBeNull();
      expect(record.monthly_search_volume).toBeNull();
      expect(record.opportunity_type).toBe("hypothesis");
    }
  });
});
