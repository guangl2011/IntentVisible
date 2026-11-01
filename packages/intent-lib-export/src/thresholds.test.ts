/**
 * Floor and split boundary tests (Export Spec v2 Output Rules 4 and 10)
 * plus the builder's rejection paths: exactly 30% is in (Market), exactly
 * 50% is Revenue, everything below the floor stays out, and mixed modes
 * are rejected — never smoothed over.
 */

import { describe, expect, it } from "vitest";

import { buildLibExport } from "./build.js";
import { LibInputError, MixedDataModeError, PooledSnapshotMissingError } from "./errors.js";
import { testInput, testLib } from "./fixtures.js";
import type { MetricsSnapshot } from "@intentvisible/core-schema";

/** All prompt ids exported for the standard world, in render order. */
function exportedPromptIds(lib: ReturnType<typeof testLib>): string[] {
  return lib.intents.flatMap((intent) =>
    [...intent.revenueExpansion, ...intent.marketExpansion].map((prompt) => prompt.promptId),
  );
}

describe("visibility floor (≥30% exported, below excluded)", () => {
  it("keeps a prompt at exactly 30% in Market Expansion", () => {
    const lib = testLib({ visibilityCamping: 84, visibilityCampingSecond: 30, visibilitySolar: 35 });
    const camping = lib.intents.find((intent) => intent.intentId === "int_camping_fridge_runtime");
    expect(camping?.marketExpansion.map((prompt) => prompt.promptId)).toEqual([
      "prompt_fridge_runtime_weekend",
    ]);
  });

  it("excludes a prompt at 29.9% and counts it below the floor", () => {
    const lib = testLib({ visibilityCampingSecond: 29.9 });
    expect(exportedPromptIds(lib)).not.toContain("prompt_fridge_runtime_weekend");
    // 2 = the weekend prompt just dropped + the base world's subfloor fixture.
    expect(lib.excluded.belowVisibilityFloor).toBe(2);
  });

  it("excludes the spec's failure case: a 24%-visibility prompt never appears in the export", () => {
    const lib = testLib();
    expect(exportedPromptIds(lib)).not.toContain("prompt_subfloor");
    expect(lib.excluded.belowVisibilityFloor).toBe(1);
  });

  it("publishes a prompt at 100% into Revenue Expansion", () => {
    const lib = testLib({ visibilityCamping: 100 });
    const camping = lib.intents.find((intent) => intent.intentId === "int_camping_fridge_runtime");
    expect(camping?.revenueExpansion.map((prompt) => prompt.visibilityPct)).toEqual([100]);
  });
});

describe("Revenue/Market split at the 50% threshold", () => {
  it("puts a prompt at exactly 50% in Revenue Expansion", () => {
    const lib = testLib({ visibilityCampingSecond: 50 });
    const camping = lib.intents.find((intent) => intent.intentId === "int_camping_fridge_runtime");
    // Overnight (84%) stays in revenue; the weekend prompt at exactly 50%
    // joins it (inclusive split), sorted by visibility descending.
    expect(camping?.revenueExpansion.map((prompt) => prompt.promptId)).toEqual([
      "prompt_fridge_runtime_overnight",
      "prompt_fridge_runtime_weekend",
    ]);
    expect(camping?.marketExpansion).toEqual([]);
  });

  it("keeps a prompt at 49.9% in Market Expansion", () => {
    const lib = testLib({ visibilityCampingSecond: 49.9 });
    const camping = lib.intents.find((intent) => intent.intentId === "int_camping_fridge_runtime");
    expect(camping?.marketExpansion.map((prompt) => prompt.promptId)).toEqual([
      "prompt_fridge_runtime_weekend",
    ]);
  });
});

describe("sorts", () => {
  it("sorts intents by demand tier desc (high before medium)", () => {
    const lib = testLib();
    expect(lib.intents.map((intent) => intent.intentId)).toEqual([
      "int_camping_fridge_runtime",
      "int_solar_panel_compatibility",
    ]);
  });

  it("sorts prompts within a section by visibility desc", () => {
    const lib = testLib({ visibilityCamping: 60, visibilityCampingSecond: 84 });
    const camping = lib.intents.find((intent) => intent.intentId === "int_camping_fridge_runtime");
    expect(camping?.revenueExpansion.map((prompt) => prompt.promptId)).toEqual([
      "prompt_fridge_runtime_weekend",
      "prompt_fridge_runtime_overnight",
    ]);
  });
});

describe("rejection paths", () => {
  it("excludes a noisy-baseline prompt — a noisy number is not published", () => {
    const lib = testLib();
    expect(exportedPromptIds(lib)).not.toContain("prompt_noisy");
    expect(lib.excluded.noisyBaseline).toBe(1);
  });

  it("rejects a lib that mixes llm_simulated and provider_measured inputs", () => {
    const input = testInput();
    const measured: MetricsSnapshot = {
      ...input.metrics[0]!,
      metrics_id: "mtrc_measured_intruder",
      data_mode: "provider_measured",
    };
    expect(() => buildLibExport({ ...input, metrics: [...input.metrics, measured] })).toThrow(
      MixedDataModeError,
    );
  });

  it("rejects per-platform-only snapshots with a pointer to computePooledMetrics", () => {
    const input = testInput();
    const [pooled] = input.metrics;
    const perPlatformOnly = pooled !== undefined ? { ...pooled, platform: "perplexity" as const } : undefined;
    expect(() =>
      buildLibExport({ ...input, metrics: perPlatformOnly === undefined ? [] : [perPlatformOnly] }),
    ).toThrow(PooledSnapshotMissingError);
  });

  it("rejects a prompt whose intent_id is not in the graph", () => {
    const input = testInput();
    const [firstPrompt] = input.prompts;
    const dangling =
      firstPrompt !== undefined ? { ...firstPrompt, intent_id: "int_ghost" as const } : undefined;
    expect(() =>
      buildLibExport({ ...input, prompts: dangling === undefined ? [] : [dangling, ...input.prompts.slice(1)] }),
    ).toThrow(LibInputError);
  });

  it("skips draft prompts — Gate 2 confirmation is the publish bar", () => {
    const input = testInput();
    const [firstPrompt] = input.prompts;
    const draft =
      firstPrompt !== undefined ? { ...firstPrompt, status: "draft" as const } : undefined;
    const lib = buildLibExport({
      ...input,
      prompts: draft === undefined ? input.prompts : [draft, ...input.prompts.slice(1)],
    });
    expect(exportedPromptIds(lib)).not.toContain("prompt_fridge_runtime_overnight");
  });
});
