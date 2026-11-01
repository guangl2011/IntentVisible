/**
 * SimulatedMonitoringRunner default behaviors on recorded fixtures — no
 * live calls: persona pinning, per-run model_id, snapshot-pure citation
 * extraction, fixed temperature, and the run-config product.
 */

import { describe, expect, it } from "vitest";

import { PLATFORMS, type Platform } from "@intentvisible/core-schema";

import {
  DEFAULT_RUNS_PER_PROMPT,
  MIN_RUNS_PER_PROMPT,
  SIMULATION_TEMPERATURE,
  SimulatedMonitoringRunner,
  enumerateMonitoringRuns,
  extractCitations,
} from "../src/index.js";
import { FakeClock, ScriptedAdapter } from "./test-doubles.js";
import { PERPLEXITY_ANSWER, fixturePrompt } from "./fixtures.js";

function runnerWith(
  scripted: string[],
  platform: Platform = "perplexity",
  personaVersion = "monitor-skill/v1",
): { runner: SimulatedMonitoringRunner; adapter: ScriptedAdapter } {
  const adapter = new ScriptedAdapter(scripted);
  return {
    runner: new SimulatedMonitoringRunner({ adapter, clock: new FakeClock(), platform, personaVersion }),
    adapter,
  };
}

describe("SimulatedMonitoringRunner — persona pinning", () => {
  it("uses the same pinned persona prompt for every run of one runner", async () => {
    const { runner, adapter } = runnerWith([PERPLEXITY_ANSWER, PERPLEXITY_ANSWER, PERPLEXITY_ANSWER]);
    const prompt = "which portable power station should I buy?";

    await runner.run(prompt, "US", "en");
    await runner.run(prompt, "US", "en");

    expect(adapter.requests).toHaveLength(2);
    expect(adapter.requests[0]?.system).toBe(adapter.requests[1]?.system);
    expect(adapter.requests[0]?.system).toContain("monitor-skill/v1");
    expect(adapter.requests[0]?.system).toContain("Perplexity");
  });

  it("sends temperature 0 and the localized user prompt", async () => {
    const { runner, adapter } = runnerWith([PERPLEXITY_ANSWER]);
    await runner.run("which portable power station should I buy?", "US", "en");

    expect(adapter.requests[0]?.temperature).toBe(SIMULATION_TEMPERATURE);
    expect(adapter.requests[0]?.temperature).toBe(0);
    expect(adapter.requests[0]?.user).toContain("country US");
    expect(adapter.requests[0]?.user).toContain("language en");
    expect(adapter.requests[0]?.user).toContain("which portable power station should I buy?");
  });
});

describe("SimulatedMonitoringRunner — run records", () => {
  it("records the producing model_id and data_mode per run", async () => {
    const { runner } = runnerWith([PERPLEXITY_ANSWER]);
    const result = await runner.run("which portable power station?", "US", "en");

    expect(result.model_id).toBe("gemini-2.5-pro");
    expect(runner.data_mode).toBe("llm_simulated");
    expect(result.ran_at).toBe(new FakeClock().isoNow());
  });

  it("returns the raw answer untouched — the immutable snapshot", async () => {
    const { runner } = runnerWith([PERPLEXITY_ANSWER]);
    const result = await runner.run("which portable power station?", "US", "en");

    expect(result.raw_answer).toBe(PERPLEXITY_ANSWER);
  });
});

describe("extractCitations — pure over the raw snapshot", () => {
  it("extracts unique URLs from the recorded answer", () => {
    const citations = extractCitations(PERPLEXITY_ANSWER);
    expect(citations).toEqual([
      "https://www.outdoorlab.org/lifepo4-safety",
      "https://www.example-reviews.com/eflow-delta-2",
      "https://www.example-reviews.com/jackery-500",
    ]);
  });

  it("is reproducible from the raw answer alone and empty when nothing is cited", () => {
    expect(extractCitations("no sources here")).toEqual([]);
    expect(extractCitations(PERPLEXITY_ANSWER)).toEqual(extractCitations(PERPLEXITY_ANSWER));
  });
});

describe("enumerateMonitoringRuns — prompts × runs × platforms", () => {
  const prompts = [
    fixturePrompt(),
    fixturePrompt({ prompt_id: "prompt_fixture_2" }),
  ];

  it("defaults to all four platforms and 3 runs per prompt", () => {
    const specs = enumerateMonitoringRuns({ prompts });
    expect(specs).toHaveLength(prompts.length * 4 * DEFAULT_RUNS_PER_PROMPT);
    expect(new Set(specs.map((spec) => spec.platform))).toEqual(new Set(PLATFORMS));
  });

  it("enumerates the full product in deterministic order", () => {
    const specs = enumerateMonitoringRuns({
      prompts,
      runs_per_prompt: 2,
      platforms: ["perplexity", "gemini"],
    });
    expect(specs).toEqual([
      { prompt_id: "prompt_fixture", prompt_text: prompts[0]?.text, platform: "perplexity", run_number: 1 },
      { prompt_id: "prompt_fixture", prompt_text: prompts[0]?.text, platform: "perplexity", run_number: 2 },
      { prompt_id: "prompt_fixture", prompt_text: prompts[0]?.text, platform: "gemini", run_number: 1 },
      { prompt_id: "prompt_fixture", prompt_text: prompts[0]?.text, platform: "gemini", run_number: 2 },
      { prompt_id: "prompt_fixture_2", prompt_text: prompts[1]?.text, platform: "perplexity", run_number: 1 },
      { prompt_id: "prompt_fixture_2", prompt_text: prompts[1]?.text, platform: "perplexity", run_number: 2 },
      { prompt_id: "prompt_fixture_2", prompt_text: prompts[1]?.text, platform: "gemini", run_number: 1 },
      { prompt_id: "prompt_fixture_2", prompt_text: prompts[1]?.text, platform: "gemini", run_number: 2 },
    ]);
    // Determinism: same config, same order.
    expect(enumerateMonitoringRuns({ prompts, runs_per_prompt: 2, platforms: ["perplexity", "gemini"] })).toEqual(specs);
  });

  it("rejects fewer than the denoising minimum of runs", () => {
    expect(() =>
      enumerateMonitoringRuns({ prompts, runs_per_prompt: MIN_RUNS_PER_PROMPT - 1 }),
    ).toThrow(RangeError);
  });
});
