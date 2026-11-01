import { describe, expect, it } from "vitest";

import * as pkg from "./index.js";

describe("data-providers", () => {
  it("exports its package name", () => {
    expect(pkg.DATA_PROVIDERS_PACKAGE_NAME).toBe("@intentvisible/data-providers");
  });

  it("exposes the reserved provider surface and its LLM defaults", () => {
    expect(typeof pkg.GeminiKeywordDataProvider).toBe("function");
    expect(typeof pkg.SimulatedMonitoringRunner).toBe("function");
    expect(typeof pkg.InMemoryKeywordVolumeCache).toBe("function");
  });

  it("exposes the pure configuration and parsing helpers", () => {
    expect(typeof pkg.enumerateMonitoringRuns).toBe("function");
    expect(typeof pkg.keywordVolumeCacheKey).toBe("function");
    expect(typeof pkg.quarterKey).toBe("function");
    expect(typeof pkg.extractCitations).toBe("function");
    expect(typeof pkg.personaSystemPrompt).toBe("function");
    expect(typeof pkg.demandEstimationSystemPrompt).toBe("function");
    expect(typeof pkg.estimateFromResponse).toBe("function");
  });

  it("carries the fixed-temperature and run-count contracts as constants", () => {
    expect(pkg.DEMAND_ESTIMATION_TEMPERATURE).toBe(0);
    expect(pkg.SIMULATION_TEMPERATURE).toBe(0);
    expect(pkg.MIN_RUNS_PER_PROMPT).toBe(2);
    expect(pkg.DEFAULT_RUNS_PER_PROMPT).toBe(3);
  });

  it("exposes all four platform personas", () => {
    expect(Object.keys(pkg.PLATFORM_PERSONA_NOTES)).toEqual([
      "chatgpt_search",
      "perplexity",
      "google_ai_overviews",
      "gemini",
    ]);
  });
});
