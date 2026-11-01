import { describe, expect, it } from "vitest";

import { PLATFORMS, PromptRecordSchema, type MarketingGraph } from "@intentvisible/core-schema";

import { LlmError } from "../../src/adapter.js";
import { collectGraphClaims, matchClaim } from "../../src/stage-b/claims.js";
import {
  MIN_PROMPTS_PER_INTENT,
  buildPromptRecords,
  dedupPrompts,
  parseExpansion,
  personaScenarioPairs,
  type ExpansionContext,
} from "../../src/stage-b/expand.js";
import { MonitoringPlanSchema, buildMonitoringPlan } from "../../src/stage-b/plan.js";
import { selectIntents } from "../../src/stage-b/select.js";
import { runStageB } from "../../src/stage-b/stage-b.js";
import {
  DISTINCT_PROMPT_TEXTS,
  evidencedClaimTexts,
  expansionJson,
  fixtureGraph,
  stageBHarness,
  testDraft,
} from "./helpers.js";

// The fixture graph is rebuilt per test — Stage A over in-memory fakes is
// cheap, and sharing an instance across tests would couple assertions.
const corpus = (graph: MarketingGraph) => evidencedClaimTexts(graph, 6);

describe("selectIntents — deterministic B.1 selection", () => {
  it("yields the identical selection when the same graph is selected twice", async () => {
    const graph = await fixtureGraph();
    const first = selectIntents(graph);
    const second = selectIntents(graph);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("cuts the batch to the requested size and rejects out-of-range sizes", async () => {
    const graph = await fixtureGraph();
    expect(selectIntents(graph, { batch_size: 1 }).batch.length).toBe(1);
    expect(selectIntents(graph, { batch_size: 20 }).batch.length).toBe(
      Math.min(20, graph.intent_topics.length),
    );
    expect(() => selectIntents(graph, { batch_size: 0 })).toThrow(RangeError);
    expect(() => selectIntents(graph, { batch_size: 21 })).toThrow(RangeError);
  });

  it("admits only intents that clear the Monitor Skill bar: high demand or open gap", async () => {
    const graph = await fixtureGraph();
    const { batch } = selectIntents(graph);
    expect(batch.length).toBeGreaterThan(0);
    for (const intent of batch) {
      expect(intent.volume_tier === "high" || intent.gap_open).toBe(true);
      expect(["high_demand", "open_gap", "high_demand_and_open_gap", "override"]).toContain(
        intent.selection_reason,
      );
    }
  });
});

describe("matchClaim — restatement matching", () => {
  it("matches a verbatim restatement and rejects an invented quote", async () => {
    const graph = await fixtureGraph();
    const full = collectGraphClaims(graph);
    const claims = corpus(graph);
    expect(claims.length).toBeGreaterThanOrEqual(5);
    expect(matchClaim(claims[0]!, full)?.text).toBe(claims[0]);
    expect(
      matchClaim("Does the VoltYet 700 include a built-in espresso machine and free speaker?", full),
    ).toBeNull();
  });
});

describe("parseExpansion — evidence validation and voice assignment", () => {
  const contextFor = async (): Promise<{ graph: MarketingGraph; context: ExpansionContext }> => {
    const graph = await fixtureGraph();
    const selection = selectIntents(graph, { batch_size: 1 });
    const intent = selection.batch[0]!;
    return {
      graph,
      context: {
        corpus: collectGraphClaims(graph),
        voices: personaScenarioPairs(graph),
        intent,
        brandId: graph.brand_id,
        country: "US",
        language: "en",
        competitorIds: graph.competitors.map((competitor) => competitor.brand_id),
      },
    };
  };

  it("keeps evidence-anchored prompts and drops invented-fact prompts with typed events", async () => {
    const { graph, context } = await contextFor();
    const claims = corpus(graph);
    const invented = "Can I get the VoltYet 500 for under $400 with a free solar panel?";
    const parsed = parseExpansion(
      expansionJson({
        texts: DISTINCT_PROMPT_TEXTS.slice(0, 5),
        claims,
        extra: [{ text: "Is the VoltYet 500 under $400? I have a strict budget.", claims: [invented] }],
      }),
      context,
    );
    expect(parsed.drafts.length).toBe(5);
    expect(parsed.dropped.length).toBe(1);
    expect(parsed.dropped[0]?.reason).toBe("invented_claim");
    expect(parsed.dropped[0]?.detail).toContain(invented);
    // The surviving prompts anchor to real graph claims only.
    for (const draft of parsed.drafts) {
      expect(draft.claims.length).toBeGreaterThanOrEqual(1);
      for (const claim of draft.claims) {
        expect(claims).toContain(claim.text);
      }
    }
  });

  it("drops prompts that restate no claim or only assumption-flagged claims", async () => {
    const { graph, context } = await contextFor();
    const assumptionOnly = collectGraphClaims(graph).find((claim) => claim.assumption);
    const parsed = parseExpansion(
      expansionJson({
        texts: DISTINCT_PROMPT_TEXTS.slice(0, 3),
        claims: corpus(graph).slice(0, 3),
        extra: [
          { text: DISTINCT_PROMPT_TEXTS[5]!, claims: [] },
          assumptionOnly === undefined
            ? { text: DISTINCT_PROMPT_TEXTS[6]!, claims: [] }
            : { text: DISTINCT_PROMPT_TEXTS[6]!, claims: [assumptionOnly.text] },
        ],
      }),
      context,
    );
    expect(parsed.dropped.length).toBe(2);
    expect(new Set(parsed.dropped.map((event) => event.reason))).toEqual(
      new Set(["unevidenced_prompt"]),
    );
    expect(parsed.drafts.length).toBe(3);
  });

  it("assigns the pre-assigned persona×scenario voices positionally", async () => {
    const { graph, context } = await contextFor();
    const pairs = personaScenarioPairs(graph);
    const parsed = parseExpansion(
      expansionJson({ texts: DISTINCT_PROMPT_TEXTS.slice(0, 5), claims: corpus(graph) }),
      context,
    );
    expect(parsed.drafts.length).toBe(5);
    parsed.drafts.forEach((draft, index) => {
      const voice = pairs[index % pairs.length]!;
      expect(draft.persona_id).toBe(voice.persona.persona_id);
      expect(draft.scenario_id).toBe(voice.scenario.scenario_id);
    });
  });

  it("rejects envelopes outside the 5–7 bound as retryable output errors", async () => {
    const { context } = await contextFor();
    expect(() =>
      parseExpansion(
        expansionJson({
          texts: DISTINCT_PROMPT_TEXTS.slice(0, 4),
          claims: context.corpus.map((claim) => claim.text),
        }),
        context,
      ),
    ).toThrow(expect.objectContaining({ name: "ModelOutputError" }));
  });
});

describe("dedupPrompts — market-partitioned lexical-semantic collapse (Verification #4)", () => {
  it("collapses exact and near-duplicate prompts onto the first-seen canonical", () => {
    const original = "Which portable power station actually runs a 12V camping fridge for two nights?";
    const reordered = "for two nights, which portable power station actually runs a 12V camping fridge?";
    const nearDupe = "Which portable power station really runs a 12V camping fridge for two nights?";
    const distinct = "Is the warranty service fast when a station fails in the middle of a trip?";
    const report = dedupPrompts([
      testDraft(original),
      testDraft(reordered),
      testDraft(nearDupe),
      testDraft(distinct),
    ]);
    expect(report.canonical.map((draft) => draft.text)).toEqual([original, distinct]);
    expect(report.collapsed.length).toBe(1);
    expect(report.collapsed[0]?.canonical.text).toBe(original);
    expect(report.collapsed[0]?.variants.map((variant) => variant.text)).toEqual([reordered, nearDupe]);
  });

  it("keeps identical texts apart across markets, brands, and languages", () => {
    const text = "Which power station fits a weekend of camping with my family?";
    const report = dedupPrompts([
      testDraft(text),
      testDraft(text, { country: "DE" }),
      testDraft(text, { language: "de" }),
      testDraft(text, { brand_id: "brand_other" }),
    ]);
    expect(report.canonical.length).toBe(4);
    expect(report.collapsed.length).toBe(0);
  });

  it("records each variant's intent and voice for the QA log", () => {
    const canonical = testDraft("Which station is quiet enough for a family campground at night?");
    const variant = testDraft("Which station is quiet enough for a family campground at night?!");
    variant.intent = { ...canonical.intent, intent_id: "int_other", intent_name: "other intent" };
    variant.persona_id = "persona_other";
    const report = dedupPrompts([canonical, variant]);
    expect(report.canonical.length).toBe(1);
    expect(report.collapsed[0]?.variants[0]).toMatchObject({
      intent_id: "int_other",
      persona_id: "persona_other",
    });
  });
});

describe("buildMonitoringPlan — blueprint defaults and contract", () => {
  const record = () =>
    buildPromptRecords([testDraft("Which power station runs a camping fridge for two nights?")], {
      model: "fixture-model",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

  it("applies the defaults: all four platforms, 3 runs, 3 baseline rounds, monthly, simulated", async () => {
    const graph = await fixtureGraph();
    const prompts = record();
    const plan = buildMonitoringPlan({
      graph,
      prompts,
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "fixture-model",
    });
    expect(plan.platforms).toEqual(PLATFORMS);
    expect(plan.runs_per_prompt).toBe(3);
    expect(plan.baseline_rounds).toBe(3);
    expect(plan.cadence).toBe("monthly");
    expect(plan.data_mode).toBe("llm_simulated");
    expect(plan.prompt_ids).toEqual(prompts.map((prompt) => prompt.prompt_id));
    expect(plan.brand_id).toBe(graph.brand_id);
    expect(plan.graph_id).toBe(graph.graph_id);
  });

  it("honors option overrides within the plan contract", async () => {
    const graph = await fixtureGraph();
    const plan = buildMonitoringPlan({
      graph,
      prompts: record(),
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "fixture-model",
      options: {
        platforms: ["gemini", "chatgpt_search"],
        runs_per_prompt: 2,
        baseline_rounds: 5,
        cadence: "weekly",
        data_mode: "provider_measured",
      },
    });
    // Platform order is canonicalized to the PLATFORMS enum order so plan ids stay stable.
    expect(plan.platforms).toEqual(["chatgpt_search", "gemini"]);
    expect(plan.runs_per_prompt).toBe(2);
    expect(plan.baseline_rounds).toBe(5);
    expect(plan.cadence).toBe("weekly");
    expect(plan.data_mode).toBe("provider_measured");
    expect(MonitoringPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("mints a deterministic plan id scoped to the graph version and rejects invalid config", async () => {
    const graph = await fixtureGraph();
    const base = {
      graph,
      prompts: record(),
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "fixture-model",
    };
    const first = buildMonitoringPlan(base);
    const second = buildMonitoringPlan(base);
    expect(first.plan_id).toBe(second.plan_id);
    const nextVersion = buildMonitoringPlan({
      ...base,
      graph: { ...graph, graph_version: graph.graph_version + 1 },
    });
    expect(nextVersion.plan_id).not.toBe(first.plan_id);

    expect(() => buildMonitoringPlan({ ...base, options: { runs_per_prompt: 1 } })).toThrow();
    expect(() =>
      buildMonitoringPlan({ ...base, options: { platforms: ["oracle"] as never } }),
    ).toThrow(RangeError);
    expect(() =>
      buildMonitoringPlan({ ...base, options: { platforms: ["chatgpt_search", "chatgpt_search"] } }),
    ).toThrow(RangeError);
  });
});

describe("runStageB — graph to runnable plan", () => {
  it("turns the fixture graph into prompts and a plan on recorded expansion responses", async () => {
    const graph = await fixtureGraph();
    const h = stageBHarness(
      graph,
      [expansionJson({ texts: DISTINCT_PROMPT_TEXTS.slice(0, 5), claims: corpus(graph) })],
      { batch_size: 1, market: { country: "US", language: "en" } },
    );
    const outcome = await runStageB(h.deps, h.input);
    if (!outcome.ok) {
      throw new Error(`expected a plan, got ${outcome.reason}: ${outcome.detail}`);
    }

    expect(outcome.prompts.length).toBe(5);
    const intentId = outcome.report.selection.batch[0]!.intent_id;
    for (const prompt of outcome.prompts) {
      expect(prompt.intent_id).toBe(intentId);
      expect(prompt.status).toBe("draft");
      expect(prompt.data_mode).toBe("llm_simulated");
      expect(prompt.country).toBe("US");
      expect(prompt.language).toBe("en");
      expect(prompt.evidence_urls.length).toBeGreaterThanOrEqual(1);
      for (const url of prompt.evidence_urls) {
        expect(url.startsWith("https://voltyet.example")).toBe(true);
      }
      expect(prompt.competitors).toEqual(graph.competitors.map((competitor) => competitor.brand_id));
      // Every stored prompt reparses clean against the contract.
      expect(PromptRecordSchema.safeParse(prompt).success).toBe(true);
    }
    expect(new Set(outcome.prompts.map((prompt) => prompt.prompt_id)).size).toBe(5);

    // Positional voice assignment held.
    const pairs = personaScenarioPairs(graph);
    outcome.prompts.forEach((prompt, index) => {
      expect(prompt.persona_id).toBe(pairs[index]!.persona.persona_id);
      expect(prompt.scenario_id).toBe(pairs[index]!.scenario.scenario_id);
    });

    // The plan is written with the prompts, defaults applied.
    expect(outcome.plan.prompt_ids).toEqual(outcome.prompts.map((prompt) => prompt.prompt_id));
    expect(outcome.plan.platforms).toEqual(PLATFORMS);
    expect(outcome.plan.runs_per_prompt).toBe(3);
    expect(outcome.plan.baseline_rounds).toBe(3);
    expect(outcome.plan.cadence).toBe("monthly");
    expect(outcome.plan.data_mode).toBe("llm_simulated");
    expect(outcome.plan.provenance.source).toBe("fixture-model");

    expect(outcome.report.prompts_per_intent).toEqual([{ intent_id: intentId, count: 5 }]);
    expect(outcome.report.collapsed).toEqual([]);
    expect(outcome.report.dropped).toEqual([]);
  });

  it("is deterministic — the same graph and responses produce the same prompts and plan twice", async () => {
    const graph = await fixtureGraph();
    const run = async () => {
      const h = stageBHarness(
        graph,
        [expansionJson({ texts: DISTINCT_PROMPT_TEXTS.slice(0, 5), claims: corpus(graph) })],
        { batch_size: 1 },
      );
      const outcome = await runStageB(h.deps, h.input);
      if (!outcome.ok) {
        throw new Error(`expected a plan, got ${outcome.reason}`);
      }
      return { prompts: outcome.prompts, plan: outcome.plan, selection: outcome.report.selection };
    };
    const first = await run();
    const second = await run();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("maps a hard transport failure to a typed llm_unavailable outcome", async () => {
    const graph = await fixtureGraph();
    const h = stageBHarness(graph, [new LlmError("provider_unavailable", "fixture outage", false)], {
      batch_size: 1,
    });
    const outcome = await runStageB(h.deps, h.input);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("llm_unavailable");
      expect(outcome.detail).toContain("expansion");
    }
  });

  it("fails with expansion_underflow when collapse thins an intent below five prompts", async () => {
    const graph = await fixtureGraph();
    const original = DISTINCT_PROMPT_TEXTS[0]!;
    const nearDupe = "I need a unit that runs my camping fridge for two full nights without a recharge?";
    const h = stageBHarness(
      graph,
      [
        expansionJson({
          texts: [
            original,
            nearDupe,
            nearDupe.replace("runs", "ran"),
            DISTINCT_PROMPT_TEXTS[4]!,
            DISTINCT_PROMPT_TEXTS[5]!,
          ],
          claims: corpus(graph),
        }),
      ],
      { batch_size: 1 },
    );
    const outcome = await runStageB(h.deps, h.input);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("expansion_underflow");
      expect(outcome.detail).toContain(MIN_PROMPTS_PER_INTENT.toString());
      expect(outcome.detail).toContain("3");
    }
  });

  it("applies customer overrides before expansion and expands the added intent", async () => {
    const graph = await fixtureGraph();
    // A batch of two allows one replacement (at most half the batch).
    const batchOfTwo = selectIntents(graph, { batch_size: 2 }).batch;
    const added = graph.intent_topics.find(
      (topic) => !batchOfTwo.some((intent) => intent.intent_id === topic.intent_id),
    )!;
    const untouched = batchOfTwo[1]!;
    const h = stageBHarness(
      graph,
      [
        // One expansion response per batch slot, in batch order; the texts
        // are disjoint so cross-intent collapse cannot thin either intent.
        expansionJson({ texts: DISTINCT_PROMPT_TEXTS.slice(0, 5), claims: corpus(graph) }),
        expansionJson({ texts: DISTINCT_PROMPT_TEXTS.slice(5, 10), claims: corpus(graph) }),
      ],
      {
        batch_size: 2,
        overrides: [
          {
            drop_intent_id: batchOfTwo[0]!.intent_id,
            add_intent_id: added.intent_id,
            note: "customer wants this intent tracked instead",
          },
        ],
      },
    );
    const outcome = await runStageB(h.deps, h.input);
    if (!outcome.ok) {
      throw new Error(`expected a plan, got ${outcome.reason}: ${outcome.detail}`);
    }
    expect(outcome.report.selection.overrides.length).toBe(1);
    expect(outcome.report.selection.batch.map((intent) => intent.intent_id)).toEqual([
      added.intent_id,
      untouched.intent_id,
    ]);
    expect(outcome.prompts.filter((prompt) => prompt.intent_id === added.intent_id).length).toBe(5);
    expect(outcome.prompts.filter((prompt) => prompt.intent_id === untouched.intent_id).length).toBe(5);
    // The first expansion prompt was grounded in the ADDED intent, not the dropped one.
    expect(h.adapter.requests[0]!.user).toContain(added.intent_name);
  });

  it("throws on a brand that is not the graph subject", async () => {
    const graph = await fixtureGraph();
    const h = stageBHarness(graph, [], { brand: { brand_id: "brand_other", name: "Other" } });
    await expect(runStageB(h.deps, h.input)).rejects.toThrow(TypeError);
  });
});
