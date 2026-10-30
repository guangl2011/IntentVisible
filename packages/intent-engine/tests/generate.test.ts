import { describe, expect, it } from "vitest";

import { IntentRecordSchema } from "@intentvisible/core-schema";

import { buildStandaloneRecord, IntentGenerator } from "../src/generate.js";
import { LlmError } from "../src/adapter.js";
import { validateCandidate, type ValidatedDraft } from "../src/validate.js";
import { FakeClock, FailingAdapter, ScriptedAdapter } from "./test-doubles.js";
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

function run(overrides: Partial<Parameters<IntentGenerator["generateBrandIntents"]>[1]> = {}) {
  return {
    markets: [AU_MARKET],
    snapshots: [SNAPSHOT, { ...SNAPSHOT, url: SPECS_URL }],
    retry: { max_attempts: 3, base_delay_ms: 1, max_delay_ms: 4 },
    ...overrides,
  };
}

function generatorWith(
  scripted: Array<string | LlmError>,
  log: string[] = [],
): IntentGenerator {
  return new IntentGenerator({
    adapter: new ScriptedAdapter(scripted),
    clock: new FakeClock(),
    log: (event) => log.push(event),
  });
}

describe("IntentGenerator — happy path", () => {
  it("generates brand-level records from a scripted response", async () => {
    const generator = generatorWith([
      candidatesJson([
        baseCandidate({ intent_name: "Category Question" }),
        baseCandidate({ intent_name: "Rival Comparison", intent_category: "Comparison" }),
        baseCandidate({ intent_name: "Trust Doubts", intent_category: "Risk & Trust" }),
      ]),
    ]);

    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records).toHaveLength(3);
    expect(outcome.records.every((record) => record.scope === "brand")).toBe(true);
    expect(outcome.records[0]?.intent_id).toBe("int_category_question");
    expect(outcome.report.candidates).toBe(3);
    expect(outcome.report.kept).toBe(3);
    expect(outcome.report.dropped).toEqual([]);
  });

  it("generates product-level records with SKU-backed evidence", async () => {
    const generator = generatorWith([
      candidatesJson([
        baseCandidate({
          intent_name: "Fridge Compatibility",
          intent_category: "Compatibility",
          sku_ids: ["sku_example_01"],
        }),
      ]),
    ]);

    const outcome = await generator.generateProductIntents(PRODUCT, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records[0]?.scope).toBe("product");
    expect(outcome.records[0]?.sku_ids).toEqual(["sku_example_01"]);
  });

  it("supplies the page evidence and registry in every prompt", async () => {
    const adapter = new ScriptedAdapter([candidatesJson([baseCandidate()])]);
    const generator = new IntentGenerator({ adapter, clock: new FakeClock() });
    await generator.generateBrandIntents(BRAND, run());

    expect(adapter.requests).toHaveLength(1);
    const user = adapter.requests[0]?.user ?? "";
    expect(user).toContain("ExampleBrand");
    expect(user).toContain(PDP_URL);
  });

  it("runs one prompt per market and stamps identity per market", async () => {
    const generator = generatorWith([
      candidatesJson([baseCandidate({ intent_name: "DE Version" })]),
      candidatesJson([baseCandidate({ intent_name: "NZ Version" })]),
    ]);

    const outcome = await generator.generateBrandIntents(BRAND, {
      ...run(),
      markets: [
        { country: "DE", language: "de" },
        { country: "NZ", language: "en" },
      ],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records.map((record) => record.country)).toEqual(["DE", "NZ"]);
    expect(outcome.records.map((record) => record.language)).toEqual(["de", "en"]);
  });

  it("keeps prompts localized per market (system prompt carries the market contract)", async () => {
    const adapter = new ScriptedAdapter([
      candidatesJson([baseCandidate({ prompts: ["Welcher Akku hält einen Kühlschrank am Laufen?"] })]),
    ]);
    const generator = new IntentGenerator({ adapter, clock: new FakeClock() });
    const outcome = await generator.generateBrandIntents(BRAND, {
      ...run(),
      markets: [{ country: "DE", language: "de" }],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(adapter.requests[0]?.user).toContain("Deutsch (de)");
    expect(outcome.records[0]?.prompts[0]).toContain("Kühlschrank");
  });
});

describe("IntentGenerator — standalone-mode invariant", () => {
  it("every generated record carries the measurement nulls, never measured values", async () => {
    const generator = generatorWith([
      candidatesJson([
        baseCandidate(),
        baseCandidate({ intent_name: "Price Barrier", intent_category: "Price" }),
      ]),
    ]);
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const record of outcome.records) {
      expect(record.measurement_status).toBe("not_measured");
      expect(record.measurement_source).toBeNull();
      expect(record.visibility_pct).toBeNull();
      expect(record.monthly_search_volume).toBeNull();
      expect(record.opportunity_type).toBe("hypothesis");
      expect(record.generation_method).toBe("llm_with_page_evidence");
    }
  });

  it("records every generated intent with at least one evidence URL that resolves to a stored snapshot", async () => {
    // Property over the whole accepted set: citations ⊆ the run's snapshots.
    const generator = generatorWith([
      candidatesJson([
        baseCandidate(),
        baseCandidate({ intent_name: "Specs Check", evidence_urls: [SPECS_URL] }),
        baseCandidate({ intent_name: "Both Pages", evidence_urls: [PDP_URL, SPECS_URL] }),
      ]),
    ]);
    const snapshots = [SNAPSHOT, { ...SNAPSHOT, url: SPECS_URL }];
    const outcome = await generator.generateBrandIntents(BRAND, {
      markets: [AU_MARKET],
      snapshots,
      retry: { max_attempts: 1, base_delay_ms: 1, max_delay_ms: 1 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const registryUrls = new Set(snapshots.map((snapshot) => snapshot.url));
    for (const record of outcome.records) {
      expect(record.evidence_urls.length).toBeGreaterThanOrEqual(1);
      for (const url of record.evidence_urls) {
        expect(registryUrls.has(url)).toBe(true);
      }
    }
  });
});

describe("IntentGenerator — validation drops", () => {
  it("drops fabricated measurements and logs them, storing only clean records", async () => {
    const log: string[] = [];
    const generator = generatorWith(
      [
        candidatesJson([
          baseCandidate({ intent_name: "Clean" }),
          baseCandidate({ intent_name: "Volume Inventor", monthly_search_volume: 1200 }),
          baseCandidate({ intent_name: "Visibility Inventor", visibility_pct: 33 }),
        ]),
      ],
      log,
    );
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records.map((record) => record.intent_name)).toEqual(["Clean"]);
    expect(outcome.report.dropped).toHaveLength(2);
    expect(outcome.report.dropped.every((event) => event.reason === "fabricated_measurement")).toBe(true);
    expect(log.join("\n")).toContain("fabricated_measurement");
  });

  it("fails as generation_empty when every candidate is dropped", async () => {
    const generator = generatorWith([
      candidatesJson([baseCandidate({ evidence_urls: ["https://off.registry.example/x"] })]),
    ]);
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome).toMatchObject({ ok: false, reason: "generation_empty" });
    if (!outcome.ok && outcome.reason === "generation_empty") {
      expect(outcome.detail).toContain("unevidenced_claim");
    }
  });

  it("fails as generation_empty when the model returns an empty array", async () => {
    const generator = generatorWith(["[]"]);
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome).toMatchObject({ ok: false, reason: "generation_empty" });
  });
});

describe("IntentGenerator — retry, backoff, and budget", () => {
  it("retries a rate-limited call and succeeds with exponential backoff", async () => {
    const clock = new FakeClock();
    const generator = new IntentGenerator({
      adapter: new ScriptedAdapter([
        new LlmError("rate_limited", "429", true),
        new LlmError("rate_limited", "429 again", true),
        candidatesJson([baseCandidate()]),
      ]),
      clock,
    });
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome.ok).toBe(true);
    expect(clock.sleeps).toEqual([1, 2]);
  });

  it("fails deterministically as llm_unavailable when the budget is spent", async () => {
    const adapter = new FailingAdapter("rate_limited", true);
    const generator = new IntentGenerator({ adapter, clock: new FakeClock() });
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome).toMatchObject({ ok: false, reason: "llm_unavailable" });
    expect(adapter.calls).toBe(3);
  });

  it("fails as llm_invalid_output when the model never returns parseable JSON", async () => {
    const generator = generatorWith(["sorry, I cannot help with that", "still no json"]);
    const outcome = await generator.generateBrandIntents(BRAND, {
      ...run(),
      retry: { max_attempts: 2, base_delay_ms: 1, max_delay_ms: 2 },
    });
    expect(outcome).toMatchObject({ ok: false, reason: "llm_invalid_output" });
  });

  it("does not retry a non-retryable failure (auth)", async () => {
    const adapter = new FailingAdapter("auth", false);
    const generator = new IntentGenerator({ adapter, clock: new FakeClock() });
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome).toMatchObject({ ok: false, reason: "llm_unavailable" });
    expect(adapter.calls).toBe(1);
  });

  it("caps candidates per market in model order", async () => {
    const generator = generatorWith([
      candidatesJson([
        baseCandidate({ intent_name: "First" }),
        baseCandidate({ intent_name: "Second" }),
        baseCandidate({ intent_name: "Third" }),
      ]),
    ]);
    const outcome = await generator.generateBrandIntents(BRAND, {
      ...run(),
      max_candidates_per_market: 2,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records.map((record) => record.intent_name)).toEqual(["First", "Second"]);
    expect(outcome.report.candidates).toBe(3);
    expect(outcome.report.kept).toBe(2);
  });
});

describe("IntentGenerator — evidence refusal", () => {
  it("refuses to run without stored snapshots", async () => {
    const generator = generatorWith([]);
    const outcome = await generator.generateBrandIntents(BRAND, {
      markets: [AU_MARKET],
      snapshots: [],
    });
    expect(outcome).toMatchObject({ ok: false, reason: "no_evidence" });
  });
});

describe("IntentGenerator — identity collisions", () => {
  it("suffixes same-named candidates instead of colliding", async () => {
    const generator = generatorWith([
      candidatesJson([
        baseCandidate({ intent_name: "Same Name" }),
        baseCandidate({ intent_name: "Same Name", intent_category: "Price" }),
      ]),
    ]);
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records[0]?.intent_id).toBe("int_same_name");
    expect(outcome.records[1]?.intent_id).toBe("int_same_name_2");
  });
});

describe("IntentGenerator — malformed run configs", () => {
  it("rejects an empty market list with a TypeError", async () => {
    const generator = generatorWith([]);
    await expect(
      generator.generateBrandIntents(BRAND, { markets: [], snapshots: [SNAPSHOT] }),
    ).rejects.toThrow(TypeError);
  });

  it("rejects a malformed market code with a TypeError", async () => {
    const generator = generatorWith([]);
    await expect(
      generator.generateBrandIntents(BRAND, {
        markets: [{ country: "australia", language: "en" }],
        snapshots: [SNAPSHOT],
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("buildStandaloneRecord", () => {
  function draftFrom(candidate: ReturnType<typeof baseCandidate>): ValidatedDraft {
    const outcome = validateCandidate(candidate, {
      scope: "product",
      brand_id: "brand_example",
      country: "AU",
      language: "en",
      allowed_evidence_urls: [PDP_URL],
      allowed_sku_ids: ["sku_example_01"],
      generation_model: "fixture-model",
    });
    if (!outcome.ok) {
      throw new Error(`fixture candidate unexpectedly invalid: ${outcome.event.detail}`);
    }
    return outcome.draft;
  }

  it("builds a standalone record with the measurement nulls and given identity", () => {
    const record = buildStandaloneRecord(
      draftFrom(baseCandidate()),
      { intent_id: "int_camping_fridge_runtime", intent_version: 1 },
      { generation_model: "fixture-model", generated_at: "2026-10-30T12:00:00.000Z" },
    );
    expect(record).toMatchObject({
      intent_id: "int_camping_fridge_runtime",
      intent_version: 1,
      measurement_status: "not_measured",
      measurement_source: null,
      visibility_pct: null,
      monthly_search_volume: null,
      opportunity_type: "hypothesis",
      generated_at: "2026-10-30T12:00:00.000Z",
    });
  });

  it("the schema guard rejects a not_measured record that carries a measured value", () => {
    // Prove the final gate directly: take a valid standalone record and
    // corrupt it with a measured value — validation must refuse it.
    const record = buildStandaloneRecord(
      draftFrom(baseCandidate()),
      { intent_id: "int_guard_check", intent_version: 1 },
      { generation_model: "fixture-model", generated_at: "2026-10-30T12:00:00.000Z" },
    );
    const corrupted = { ...record, visibility_pct: 42 };
    const result = IntentRecordSchema.safeParse(corrupted);
    expect(result.success).toBe(false);
  });
});

describe("IntentGenerator — semantic dedup", () => {
  it("reuses an existing library intent_id with a version bump on rewording", async () => {
    const generator = generatorWith([candidatesJson([baseCandidate()])]);
    const existing = [
      {
        intent_id: "int_camping_fridge_runtime",
        scope: "brand" as const,
        brand_id: BRAND.brand_id,
        country: "AU",
        language: "en",
        intent_category: "Technical" as const,
        topic: "camping_fridge_runtime",
        intent_name: "Camping Fridge Runtime",
        intent_version: 3,
      },
    ];

    const outcome = await generator.generateBrandIntents(BRAND, run({ existing }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records[0]?.intent_id).toBe("int_camping_fridge_runtime");
    expect(outcome.records[0]?.intent_version).toBe(4);
    expect(outcome.report.reused).toBe(1);
  });

  it("mints fresh ids when the library has no semantic match", async () => {
    const generator = generatorWith([candidatesJson([baseCandidate()])]);
    const outcome = await generator.generateBrandIntents(BRAND, run({ existing: [] }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records[0]?.intent_id).toBe("int_camping_fridge_runtime");
    expect(outcome.records[0]?.intent_version).toBe(1);
    expect(outcome.report.reused).toBe(0);
  });

  it("does not merge the same topic across different markets", async () => {
    const generator = generatorWith([
      candidatesJson([baseCandidate()]),
      candidatesJson([
        baseCandidate({
          intent_name: "Kühlschrank Laufzeit",
          prompts: ["Wie lange läuft ein Kühlschrank beim Campen?"],
        }),
      ]),
    ]);
    const outcome = await generator.generateBrandIntents(
      BRAND,
      run({ markets: [AU_MARKET, { ...AU_MARKET, country: "DE", language: "de" }] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const ids = outcome.records.map((record) => record.intent_id);
    expect(new Set(ids).size).toBe(2);
    // Same topic, different markets → distinct intents with their own ids.
    expect(ids).toContain("int_camping_fridge_runtime");
    expect(ids).toContain("int_ku_hlschrank_laufzeit");
  });
});
