/**
 * Stage B test fixtures. The Marketing Graph is produced by a real Stage A
 * run over the fixture site (in-memory fakes only — no HTTP, no live LLM),
 * and expansion responses are recorded-style JSON quoting claims harvested
 * from that graph. Prompt texts are genuinely different sentences, so
 * same-intent prompts pairwise overlap far below the 0.5 collapse bar and
 * survive dedup unless a test deliberately duplicates them.
 */

import type { MarketingGraph } from "@intentvisible/core-schema";

import type { LlmError } from "../../src/adapter.js";
import { runStageA } from "../../src/stage-a/stage-a.js";
import { collectGraphClaims } from "../../src/stage-b/claims.js";
import { personaScenarioPairs, type ExpandedPromptDraft } from "../../src/stage-b/expand.js";
import type { RankedIntent } from "../../src/stage-b/select.js";
import type { StageBDeps, StageBInput } from "../../src/stage-b/stage-b.js";
import { FakeClock, ScriptedAdapter } from "../test-doubles.js";
import {
  DEFAULT_SPOT_CHECK_ANSWERS,
  FakeCrawlFetcher,
  FakeKeywordProvider,
  FakeSpotCheckRunner,
  HOME_URL,
  InMemorySnapshotStore,
  entityResolutionJson,
  fixtureSitePages,
  personasModelingJson,
} from "../stage-a/helpers.js";
import type { KeywordVolumeSource } from "../../src/stage-a/demand.js";

export const STAGE_B_RETRY = { max_attempts: 3, base_delay_ms: 1, max_delay_ms: 4 };

/** High for camping research, medium for price comparisons, low for long tails — mirrors the Stage A harness. */
function defaultKeywordProvider(): KeywordVolumeSource {
  return new FakeKeywordProvider((keyword) => {
    if (keyword.includes("price") || keyword.includes("cheapest")) return "medium";
    if (keyword.includes("alternative") || keyword.includes("ban")) return "low";
    return "high";
  });
}

/**
 * Runs Stage A over the fixture site (in-memory fakes only) and returns
 * the validated Marketing Graph the Stage B modules consume.
 */
export async function fixtureGraph(): Promise<MarketingGraph> {
  const outcome = await runStageA(
    {
      siteUrl: HOME_URL,
      brand: { brand_id: "brand_voltyet", name: "VoltYet" },
      market: { country: "AU", language: "en" },
    },
    {
      fetcher: new FakeCrawlFetcher({ pages: fixtureSitePages() }),
      snapshotStore: new InMemorySnapshotStore(),
      clock: new FakeClock(),
      adapter: new ScriptedAdapter([entityResolutionJson(), personasModelingJson()]),
      retry: STAGE_B_RETRY,
      keywordProvider: defaultKeywordProvider(),
      spotCheckRunner: new FakeSpotCheckRunner(DEFAULT_SPOT_CHECK_ANSWERS),
    },
  );
  if (!outcome.ok) {
    throw new Error(`fixture Stage A run failed: ${outcome.reason} — ${outcome.detail}`);
  }
  return outcome.graph;
}

/** Twelve genuinely different buyer questions — pairwise overlap far below 0.5. */
export const DISTINCT_PROMPT_TEXTS = [
  "I need a unit that runs my camping fridge for two full nights without a recharge — which one holds up?",
  "My fridge died on the last trip when the station cut out early; what should I check before buying?",
  "Which station do you recommend if I only camp with the family cooler and lights on weekends?",
  "Is it realistic to keep phones, a 12V fridge, and a lantern running off one portable unit?",
  "What capacity do I actually need for a weekend away so the fridge never dies overnight?",
  "Can one battery handle an esky fridge plus phone charging for three days off-grid?",
  "Which portable station is quiet enough to run at a powered campsite with close neighbours?",
  "How many watt-hours should I budget for if I want to boil a kettle twice a day while touring?",
  "Do I need a separate solar blanket or will the station top up from the car while driving?",
  "Which brand gives the clearest battery percentage readout so I am never guessing at camp?",
  "Is it worth paying more for a unit with a built-in inverter for my coffee machine?",
  "What is the lightest setup that still powers a CPAP machine for two nights in a tent?",
] as const;

/** The first `count` evidenced (URL-cited) claim texts from the graph, in corpus order. */
export function evidencedClaimTexts(graph: MarketingGraph, count: number): string[] {
  return collectGraphClaims(graph)
    .filter((claim) => claim.evidence_urls.length > 0)
    .slice(0, count)
    .map((claim) => claim.text);
}

/**
 * A recorded-style expansion response for one intent: one entry per text,
 * each quoting the next evidenced claim (cycled). `extra` entries append
 * verbatim — invented-claim and unevidenced cases ride there.
 */
export function expansionJson(options: {
  texts: readonly string[];
  claims: readonly string[];
  extra?: Array<{ text: string; claims?: string[] }>;
}): string {
  const prompts = options.texts.map((text, index) => ({
    text,
    claims: [options.claims[index % options.claims.length]],
  }));
  return JSON.stringify({
    prompts: [...prompts, ...(options.extra ?? []).map((entry) => ({ claims: [], ...entry }))],
  });
}

/** A one-intent Stage B harness: scripted responses queue in batch order. */
export function stageBHarness(
  graph: MarketingGraph,
  responses: Array<string | LlmError>,
  inputOverrides: Partial<StageBInput> = {},
): { input: StageBInput; deps: StageBDeps; adapter: ScriptedAdapter } {
  const adapter = new ScriptedAdapter(responses);
  return {
    input: {
      graph,
      brand: { brand_id: graph.brand_id, name: "VoltYet" },
      ...inputOverrides,
    },
    deps: { adapter, clock: new FakeClock(), retry: STAGE_B_RETRY },
    adapter,
  };
}

/** A minimal ExpandedPromptDraft for dedup and record-assembly unit tests. */
export function testDraft(
  text: string,
  overrides: Partial<ExpandedPromptDraft> = {},
): ExpandedPromptDraft {
  const intent: RankedIntent = {
    intent_id: "int_test",
    intent_name: "test intent",
    buyer_stage: "Solution Research",
    intent_category: "Solution Research",
    volume_tier: "high",
    void_rate_pct: 70,
    gap_open: true,
    selection_reason: "high_demand_and_open_gap",
    rank: 1,
  };
  return {
    text,
    claims: [
      {
        text: "Portable power stations for camping trips.",
        assumption: false,
        evidence_urls: ["https://voltyet.example/pages/portable-power-stations"],
        source: "test",
      },
    ],
    persona_id: "persona_test",
    scenario_id: "scenario_test",
    intent,
    brand_id: "brand_test",
    country: "US",
    language: "en",
    competitor_ids: [],
    ...overrides,
  };
}

/** The fixture graph's persona×scenario voices, for positional assertions. */
export function fixtureVoices(graph: MarketingGraph) {
  return personaScenarioPairs(graph);
}
