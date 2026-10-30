import { IntentRecordSchema } from "@intentvisible/core-schema";
import { describe, expect, it } from "vitest";

import {
  dedupDrafts,
  freshIntentId,
  summaryOf,
  tokenOverlap,
  type ExistingIntentSummary,
} from "../src/dedup.js";
import { baseCandidate } from "./fixtures.js";

function existingSummary(overrides: Partial<ExistingIntentSummary> = {}): ExistingIntentSummary {
  return {
    intent_id: "int_existing",
    scope: "brand",
    brand_id: "brand_example",
    country: "AU",
    language: "en",
    intent_category: "Technical",
    topic: undefined,
    intent_name: "Camping Fridge Runtime",
    intent_version: 1,
    ...overrides,
  };
}

describe("tokenOverlap", () => {
  it("is 1 for identical names and 0 for disjoint ones", () => {
    expect(tokenOverlap("Camping Fridge Runtime", "runtime fridge camping")).toBe(1);
    expect(tokenOverlap("Camping Fridge Runtime", "Solar Panel Charging")).toBe(0);
  });

  it("scores partial overlap between the two", () => {
    const overlap = tokenOverlap("Camping Fridge Runtime", "Camping Fridge Battery Life");
    expect(overlap).toBeGreaterThan(0);
    expect(overlap).toBeLessThan(1);
  });

  it("treats empty token sets as no overlap", () => {
    expect(tokenOverlap("!!!", "Camping Fridge")).toBe(0);
  });
});

describe("freshIntentId", () => {
  it("mints the plain id first and suffixes on collision", () => {
    const used = new Set<string>(["int_camping_fridge_runtime"]);
    expect(freshIntentId("Camping Fridge Runtime", used)).toBe("int_camping_fridge_runtime_2");
  });
});

describe("dedupDrafts", () => {
  it("collapses a paraphrase pair (same topic, different wording) onto one id with a version bump", () => {
    const first = baseCandidate({
      intent_name: "Camping Fridge Runtime",
      topic: "fridge runtime",
    });
    const reworded = baseCandidate({
      intent_name: "How long can a fridge run while camping",
      topic: "fridge runtime",
      prompts: ["Will a camping fridge survive the night on one battery?"],
    });
    const dedup = dedupDrafts([first, reworded], []);
    expect(dedup.assigned).toHaveLength(2);
    expect(dedup.assigned[0]?.intent_id).toBe("int_camping_fridge_runtime");
    expect(dedup.assigned[1]?.intent_id).toBe("int_camping_fridge_runtime");
    expect(dedup.assigned[0]?.intent_version).toBe(1);
    expect(dedup.assigned[1]?.intent_version).toBe(2);
  });

  it("assigns distinct ids to distinct topics", () => {
    const a = baseCandidate({ intent_name: "Fridge Runtime", topic: "fridge runtime" });
    const b = baseCandidate({
      intent_name: "Solar Charging",
      topic: "solar charging",
      intent_category: "Price",
    });
    const dedup = dedupDrafts([a, b], []);
    expect(dedup.assigned[0]?.intent_id).toBe("int_fridge_runtime");
    expect(dedup.assigned[1]?.intent_id).toBe("int_solar_charging");
    expect(dedup.fresh).toBe(2);
  });

  it("reuses an existing library id with a version bump on rewording", () => {
    // Candidates carry no identity — the pipeline injects it — so the draft
    // under test gets the summary's partition explicitly.
    const draft = {
      ...baseCandidate({ intent_name: "Overnight fridge power", topic: "fridge runtime" }),
      scope: "brand" as const,
      brand_id: "brand_example",
      country: "AU" as const,
      language: "en" as const,
    };
    const dedup = dedupDrafts([draft], [
      existingSummary({ intent_id: "int_fridge-runtime", topic: "fridge runtime", intent_version: 4 }),
    ]);
    expect(dedup.assigned[0]?.intent_id).toBe("int_fridge-runtime");
    expect(dedup.assigned[0]?.intent_version).toBe(5);
    expect(dedup.assigned[0]?.reused).toBe(true);
    expect(dedup.reused).toBe(1);
    expect(dedup.fresh).toBe(0);
  });

  it("never merges across markets: same topic in another country is a distinct intent", () => {
    const au = baseCandidate({ intent_name: "Fridge Runtime", topic: "fridge runtime" });
    const de = baseCandidate({
      intent_name: "Kühlschrank Laufzeit",
      topic: "fridge runtime",
      prompts: ["Wie lange läuft ein Kühlschrank am Campen?"],
    });
    const dedup = dedupDrafts([au, { ...de, country: "DE", language: "de" }], []);
    expect(dedup.assigned[0]?.intent_id).toBe("int_fridge_runtime");
    // The German candidate mints its id from its own name — markets never merge.
    expect(dedup.assigned[1]?.intent_id).toBe("int_ku_hlschrank_laufzeit");
  });

  it("fuzzy-matches name paraphrases without a topic", () => {
    const a = baseCandidate({ intent_name: "Camping Fridge Runtime" });
    const b = baseCandidate({ intent_name: "Runtime of a Camping Fridge" });
    const dedup = dedupDrafts([a, b], []);
    expect(dedup.assigned[0]?.intent_id).toBe("int_camping_fridge_runtime");
    expect(dedup.assigned[1]?.intent_id).toBe("int_camping_fridge_runtime");
    expect(dedup.assigned[1]?.intent_version).toBe(2);
  });

  it("keeps names with no token overlap as distinct intents", () => {
    const a = baseCandidate({ intent_name: "Camping Fridge Runtime" });
    const b = baseCandidate({ intent_name: "Solar Panel Charging", intent_category: "Price" });
    const dedup = dedupDrafts([a, b], []);
    expect(dedup.assigned[0]?.intent_id).toBe("int_camping_fridge_runtime");
    expect(dedup.assigned[1]?.intent_id).toBe("int_solar_panel_charging");
  });

  it("does not dedup product-scope drafts against brand-scope summaries", () => {
    const draft = baseCandidate({ intent_name: "Fridge Runtime", topic: "fridge runtime" });
    const dedup = dedupDrafts([{ ...draft, scope: "product" as const }], [
      existingSummary({ intent_id: "int_fridge-runtime", topic: "fridge runtime" }),
    ]);
    expect(dedup.assigned[0]?.reused).toBe(false);
    expect(dedup.assigned[0]?.intent_id).not.toBe("int_fridge-runtime");
  });

  it("version-bumps repeated reuse of the same id within one run", () => {
    const a = baseCandidate({ intent_name: "Fridge Runtime", topic: "fridge runtime" });
    const b = baseCandidate({ intent_name: "How long will the fridge run", topic: "fridge runtime" });
    const c = baseCandidate({ intent_name: "Fridge runtime overnight", topic: "fridge runtime" });
    const dedup = dedupDrafts([a, b, c], []);
    expect(dedup.assigned.map((a) => a.intent_version)).toEqual([1, 2, 3]);
    expect(new Set(dedup.assigned.map((a) => a.intent_id)).size).toBe(1);
  });
});

describe("summaryOf", () => {
  it("projects a record onto the dedup-matching summary", () => {
    const draft = baseCandidate();
    // Identity fields are pipeline-injected (candidates carry none), so the
    // record under test supplies them explicitly.
    const record = IntentRecordSchema.parse({
      schema_version: "1.0.0",
      intent_id: "int_fridge_runtime",
      intent_version: 3,
      scope: "brand",
      brand_id: "brand_example",
      intent_name: draft.intent_name,
      buyer_stage: draft.buyer_stage,
      intent_category: draft.intent_category,
      country: "AU",
      language: "en",
      prompts: draft.prompts,
      sku_ids: draft.sku_ids,
      evidence_urls: draft.evidence_urls,
      generation_method: "llm_with_page_evidence",
      measurement_status: "not_measured",
      measurement_source: null,
      visibility_pct: null,
      monthly_search_volume: null,
      confidence: draft.confidence,
    });
    const summary = summaryOf(record);
    expect(summary.intent_id).toBe("int_fridge_runtime");
    expect(summary.intent_version).toBe(3);
    expect(summary.country).toBe("AU");
  });
});
