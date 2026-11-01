/**
 * Verification #11: the SAME conformance suites pass for the LLM defaults
 * AND for fixture implementations standing in for future advanced
 * providers — no caller can tell simulated from real by interface.
 */

import {
  FixtureKeywordDataProvider,
  FixtureMonitoringRunner,
  FakeClock,
  ScriptedAdapter,
} from "./test-doubles.js";
import {
  keywordProviderConformance,
  monitoringRunnerConformance,
} from "./conformance-suite.js";
import {
  GeminiKeywordDataProvider,
  SimulatedMonitoringRunner,
} from "../src/index.js";
import {
  measuredKeywordVolumes,
  PERPLEXITY_ANSWER,
  simulatedKeywordVolumes,
  TIER_RESPONSE_JSON,
} from "./fixtures.js";

keywordProviderConformance(
  "GeminiKeywordDataProvider (scripted LLM default)",
  () => new GeminiKeywordDataProvider({ adapter: new ScriptedAdapter([TIER_RESPONSE_JSON]), clock: new FakeClock() }),
);

keywordProviderConformance(
  "FixtureKeywordDataProvider (llm_estimated)",
  () => new FixtureKeywordDataProvider(simulatedKeywordVolumes()),
);

keywordProviderConformance(
  "FixtureKeywordDataProvider (provider_measured — advanced-tier stand-in)",
  () => new FixtureKeywordDataProvider(measuredKeywordVolumes()),
);

monitoringRunnerConformance(
  "SimulatedMonitoringRunner (scripted LLM default)",
  () =>
    new SimulatedMonitoringRunner({
      adapter: new ScriptedAdapter([PERPLEXITY_ANSWER]),
      clock: new FakeClock(),
      platform: "perplexity",
      personaVersion: "monitor-skill/v1",
    }),
);

monitoringRunnerConformance(
  "FixtureMonitoringRunner (provider_measured — advanced-tier stand-in)",
  () =>
    new FixtureMonitoringRunner("perplexity", "provider_measured", {
      raw_answer: PERPLEXITY_ANSWER,
      citations: ["https://www.example-reviews.com/eflow-delta-2"],
      model_id: "dataforseo/gpt-4o-search",
    }),
);
