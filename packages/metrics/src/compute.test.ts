import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MetricsSnapshotSchema, MonitoringRunSchema } from "@intentvisible/core-schema";

import { computeMetrics, computePooledMetrics, type MonitoringRun } from "./compute.js";
import { MetricsInputError, MixedDataModeError } from "./errors.js";
import { isHighDifferentiationOpportunity } from "./formulas.js";
import type { BrandAliasConfig } from "./types.js";

/**
 * Hand-computed fixture baselines (blueprint Stage C.2; Monitor Skill
 * §4). Every expected number below is derived by hand from the raw
 * fixture answers — tests assert the formulas, not an LLM's mood.
 */

const LEXICON: BrandAliasConfig = {
  brandId: "brand_solix",
  brandAliases: ["Solix", "S2000"],
  competitors: [
    { id: "brand_ecoflow", aliases: ["EcoFlow", "Delta 2"] },
    { id: "brand_jackery", aliases: ["Jackery", "Explorer 1000"] },
  ],
};

const OPTIONS = {
  brandId: "brand_solix",
  intentId: "int_camping_fridge_runtime",
  aliases: LEXICON,
};

const R1 = "2026-11-01T00:00:00Z";
const R2 = "2026-11-01T06:00:00Z";

/** Build a valid stored run around a raw fixture answer. */
function fixtureRun(fields: {
  runId: string;
  promptId: string;
  platform: "perplexity" | "gemini";
  round: number;
  rawAnswer: string;
  ranAt?: string;
  dataMode?: "llm_simulated" | "provider_measured";
}): MonitoringRun {
  return MonitoringRunSchema.parse({
    schema_version: "2.0.0",
    run_id: fields.runId,
    prompt_id: fields.promptId,
    platform: fields.platform,
    round: fields.round,
    raw_answer: fields.rawAnswer,
    raw_answer_content_hash: createHash("sha256").update(fields.rawAnswer).digest("hex"),
    citations: [],
    model_id: "gemini-2.5-pro",
    country: "US",
    language: "en",
    ran_at: fields.ranAt ?? R1,
    data_mode: fields.dataMode ?? "llm_simulated",
    provenance: { source: "gemini-2.5-pro", retrieved_at: fields.ranAt ?? R1 },
  });
}

/**
 * Scenario A (perplexity, prompt_fridge_runtime) — hand ledger:
 * r1a recommends Jackery; r1b recommends EcoFlow + Jackery; r2a recommends
 * only Solix (no competitor → void); r2b recommends nothing (void).
 *  brand visibility: r1 0/2, r2 1/2 → group 1/4 = 25%, spread 50 → noisy
 *  competitor visibility: Jackery 2/4 = 50 (top), EcoFlow 1/4 = 25
 *  leader gap: 50 − 25 = 25
 *  void rate: 2/4 = 50% → opportunity tag true
 *  sentiment facts (brand sentences): +1, −1 → index 50
 *  citations: example.com ×2, rival.example.com ×1 → 66.67 / 33.33
 */
const SCENARIO_A: MonitoringRun[] = [
  fixtureRun({
    runId: "run_a1",
    promptId: "prompt_fridge_runtime",
    platform: "perplexity",
    round: 1,
    rawAnswer:
      "The Jackery Explorer 1000 is the best pick for a two-night camping fridge trip. " +
      "It is reliable and efficient. Full review: https://www.example.com/reviews/jackery",
  }),
  fixtureRun({
    runId: "run_a2",
    promptId: "prompt_fridge_runtime",
    platform: "perplexity",
    round: 1,
    rawAnswer:
      "I recommend the EcoFlow Delta 2 — reliable and efficient. " +
      "Also consider the Jackery Explorer 1000, though it is overpriced. " +
      "Compare: https://rival.example.com/ecoflow-vs-jackery",
  }),
  fixtureRun({
    runId: "run_a3",
    promptId: "prompt_fridge_runtime",
    platform: "perplexity",
    round: 2,
    ranAt: R2,
    rawAnswer:
      "The Solix S2000 is the best value for camping fridges. " +
      "The Solix S2000 app is buggy. Specs: https://www.example.com/products/s2000",
  }),
  fixtureRun({
    runId: "run_a4",
    promptId: "prompt_fridge_runtime",
    platform: "perplexity",
    round: 2,
    ranAt: R2,
    rawAnswer:
      "Honestly, none of these stand out. The prices across the category feel " +
      "overpriced for what you get.",
  }),
];

/**
 * Scenario B (gemini, prompt_shelf_comparison) — hand ledger:
 * every answer names Solix; r1 and r2 each 2/2 → 100% visibility, stable.
 *  competitor visibility: EcoFlow 2/4 = 50, Jackery 2/4 = 50 — a tie,
 *  broken deterministically to the lexicographically smaller id (EcoFlow)
 *  leader gap: 50 − 100 = −50 (the brand leads)
 *  void rate: 0/4 = 0% → tag false (every answer names a competitor)
 *  sentiment facts: 0, +1, +1, 0 → mean 0.5 → index 75
 *  citations: example.com ×2, rival.example.com ×2 → 50 / 50
 */
const SCENARIO_B: MonitoringRun[] = [
  fixtureRun({
    runId: "run_b1",
    promptId: "prompt_shelf_comparison",
    platform: "gemini",
    round: 1,
    rawAnswer:
      "The EcoFlow Delta 2 is the top choice for camping power, beating the " +
      "Solix S2000 on weight. https://www.example.com/ecoflow-delta2",
  }),
  fixtureRun({
    runId: "run_b2",
    promptId: "prompt_shelf_comparison",
    platform: "gemini",
    round: 1,
    rawAnswer:
      "I recommend the Jackery Explorer 1000 over the Solix S2000 for pure " +
      "capacity. Specs: https://rival.example.com/jackery-explorer",
  }),
  fixtureRun({
    runId: "run_b3",
    promptId: "prompt_shelf_comparison",
    platform: "gemini",
    round: 2,
    ranAt: R2,
    rawAnswer:
      "I recommend the Solix S2000 over the Jackery Explorer 1000 — it is excellent " +
      "for two-night trips. Specs: https://www.example.com/products/s2000",
  }),
  fixtureRun({
    runId: "run_b4",
    promptId: "prompt_shelf_comparison",
    platform: "gemini",
    round: 2,
    ranAt: R2,
    rawAnswer:
      "The Solix S2000 beats the EcoFlow Delta 2 as a solid choice for campers, though " +
      "it is heavy and overpriced. Review: https://rival.example.com/solix-review",
  }),
];

describe("computeMetrics", () => {
  it("rejects zero runs", () => {
    expect(() => computeMetrics([], OPTIONS)).toThrow(MetricsInputError);
  });

  it("rejects a baseline mixing data modes (typed error)", () => {
    const mixed = [
      SCENARIO_B[0] as MonitoringRun,
      fixtureRun({
        runId: "run_measured",
        promptId: "prompt_shelf_comparison",
        platform: "gemini",
        round: 2,
        ranAt: R2,
        dataMode: "provider_measured",
        rawAnswer: "The Solix S2000 is a solid choice.",
      }),
    ];
    try {
      computeMetrics(mixed, OPTIONS);
      expect.unreachable("mixed-mode baseline must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(MixedDataModeError);
      expect((error as MixedDataModeError).code).toBe("MIXED_DATA_MODE");
      expect((error as MixedDataModeError).foundModes.sort()).toEqual([
        "llm_simulated",
        "provider_measured",
      ]);
    }
  });

  it("requires at least two baseline rounds per prompt × platform", () => {
    const singleRound = SCENARIO_A.filter((run) => run.round === 1);
    expect(() => computeMetrics(singleRound, OPTIONS)).toThrow(MetricsInputError);
  });

  it("computes scenario A per the hand ledger (noisy, competitor-led)", () => {
    const snapshots = computeMetrics(SCENARIO_A, OPTIONS);
    expect(snapshots).toHaveLength(1);
    const a = snapshots[0] as NonNullable<(typeof snapshots)[number]>;

    expect(a.metrics_id).toBe(
      "mtrc_brand_solix_int_camping_fridge_runtime_prompt_fridge_runtime_perplexity",
    );
    expect(a.prompt_id).toBe("prompt_fridge_runtime");
    expect(a.platform).toBe("perplexity");
    expect(a.visibility_pct).toBe(25);
    expect(a.top_competitor_id).toBe("brand_jackery");
    expect(a.leader_gap_pct).toBe(25);
    expect(a.void_rate_pct).toBe(50);
    expect(isHighDifferentiationOpportunity(a.void_rate_pct)).toBe(true);
    expect(a.sentiment_index).toBe(50);
    expect(a.citation_share).toEqual([
      { domain: "example.com", share_pct: 66.67 },
      { domain: "rival.example.com", share_pct: 33.33 },
    ]);
    expect(a.consensus).toBe("noisy");
  });

  it("computes scenario B per the hand ledger (stable, brand-led)", () => {
    const snapshots = computeMetrics(SCENARIO_B, OPTIONS);
    const b = snapshots[0] as NonNullable<(typeof snapshots)[number]>;

    expect(b.prompt_id).toBe("prompt_shelf_comparison");
    expect(b.platform).toBe("gemini");
    expect(b.visibility_pct).toBe(100);
    expect(b.top_competitor_id).toBe("brand_ecoflow"); // tie at 50 → lexicographic
    expect(b.leader_gap_pct).toBe(-50);
    expect(b.void_rate_pct).toBe(0);
    expect(isHighDifferentiationOpportunity(b.void_rate_pct)).toBe(false);
    expect(b.sentiment_index).toBe(75);
    expect(b.citation_share).toEqual([
      { domain: "example.com", share_pct: 50 },
      { domain: "rival.example.com", share_pct: 50 },
    ]);
    expect(b.consensus).toBe("stable");
  });

  it("stamps the full provenance block on every snapshot", () => {
    const snapshots = computeMetrics([...SCENARIO_A, ...SCENARIO_B], OPTIONS);
    for (const snapshot of snapshots) {
      expect(MetricsSnapshotSchema.parse(snapshot)).toEqual(snapshot);
      expect(snapshot.run_count).toBe(4);
      expect(snapshot.platforms).toEqual([snapshot.platform]);
      expect(snapshot.date_range).toEqual({ from: R1, to: R2 });
      expect(snapshot.provider_model).toBe("gemini-2.5-pro");
      expect(snapshot.data_mode).toBe("llm_simulated");
      expect(snapshot.provenance).toEqual({
        source: "gemini-2.5-pro",
        retrieved_at: R2,
      });
      expect(snapshot.schema_version).toBe("2.0.0");
      expect(snapshot.brand_id).toBe("brand_solix");
      expect(snapshot.intent_id).toBe("int_camping_fridge_runtime");
    }
  });
});

describe("computePooledMetrics", () => {
  it("pools scenarios A and B per the hand ledger", () => {
    const pooled = computePooledMetrics([...SCENARIO_A, ...SCENARIO_B], OPTIONS);

    expect(pooled.prompt_id).toBeUndefined();
    expect(pooled.platform).toBeUndefined();
    expect(pooled.platforms).toEqual(["gemini", "perplexity"]);
    // brand mentions 1 + 4 of 8
    expect(pooled.visibility_pct).toBe(62.5);
    // Jackery 4/8 = 50 (top), EcoFlow 3/8 = 37.5; gap 50 − 62.5
    expect(pooled.top_competitor_id).toBe("brand_jackery");
    expect(pooled.leader_gap_pct).toBe(-12.5);
    // void: scenario A r2a + r2b → exactly 2/8 = 25%
    expect(pooled.void_rate_pct).toBe(25);
    expect(isHighDifferentiationOpportunity(pooled.void_rate_pct)).toBe(true);
    // facts [1, −1, 0, 1, 1, 0] → mean 1/3 → 66.67
    expect(pooled.sentiment_index).toBe(66.67);
    // example.com 4/7 = 57.14, rival.example.com 3/7 = 42.86
    expect(pooled.citation_share).toEqual([
      { domain: "example.com", share_pct: 57.14 },
      { domain: "rival.example.com", share_pct: 42.86 },
    ]);
    // scenario A is noisy → the pooled snapshot never hides it
    expect(pooled.consensus).toBe("noisy");
    expect(pooled.run_count).toBe(8);
    expect(pooled.data_mode).toBe("llm_simulated");
  });

  it("rejects zero runs and mixed modes like the grouped computation", () => {
    expect(() => computePooledMetrics([], OPTIONS)).toThrow(MetricsInputError);
    const mixed = [
      SCENARIO_A[0] as MonitoringRun,
      fixtureRun({
        runId: "run_measured",
        promptId: "prompt_fridge_runtime",
        platform: "perplexity",
        round: 2,
        ranAt: R2,
        dataMode: "provider_measured",
        rawAnswer: "The Solix S2000 is a solid choice.",
      }),
    ];
    expect(() => computePooledMetrics(mixed, OPTIONS)).toThrow(MixedDataModeError);
  });

  it("keeps a single stable group stable when pooled", () => {
    const pooled = computePooledMetrics(SCENARIO_B, OPTIONS);
    expect(pooled.consensus).toBe("stable");
  });

  it("stamps prompt_id and a distinct id when pooling a single prompt's runs", () => {
    const intentPooled = computePooledMetrics(SCENARIO_B, OPTIONS);
    const promptPooled = computePooledMetrics(SCENARIO_B, {
      ...OPTIONS,
      promptId: "prompt_fridge_runtime",
    });
    expect(promptPooled.prompt_id).toBe("prompt_fridge_runtime");
    expect(promptPooled.platform).toBeUndefined();
    expect(promptPooled.metrics_id).not.toBe(intentPooled.metrics_id);
    expect(intentPooled.prompt_id).toBeUndefined();
  });
});
