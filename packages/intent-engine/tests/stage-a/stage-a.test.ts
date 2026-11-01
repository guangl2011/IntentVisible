import { describe, expect, it } from "vitest";

import { MarketingGraphSchema } from "@intentvisible/core-schema";

import { LlmError } from "../../src/adapter.js";
import { runStageA } from "../../src/stage-a/stage-a.js";
import { FakeClock, ScriptedAdapter } from "../test-doubles.js";
import {
  DEFAULT_SPOT_CHECK_ANSWERS,
  FakeCrawlFetcher,
  FakeKeywordProvider,
  FakeSpotCheckRunner,
  FIXTURE_URLS,
  HOME_URL,
  InMemorySnapshotStore,
  SITE,
  cappedSite,
  entityResolutionJson,
  fixtureSitePages,
  personasModelingJson,
} from "./helpers.js";

import type { KeywordVolumeSource } from "../../src/stage-a/demand.js";
import type { SpotCheckRunner } from "../../src/stage-a/spot-check.js";

const RETRY = { max_attempts: 3, base_delay_ms: 1, max_delay_ms: 4 };

interface HarnessOverrides {
  scripted?: Array<string | LlmError>;
  spotCheckRunner?: SpotCheckRunner;
  keywordProvider?: KeywordVolumeSource;
  crawl?: { weekly_iteration?: boolean; page_cap?: number };
  siteUrl?: string;
  graphVersion?: number;
}

/** Full Stage A harness over the fixture site — every dependency in-memory. */
function harness(overrides: HarnessOverrides = {}) {
  const pages = overrides.siteUrl === undefined ? fixtureSitePages() : undefined;
  const fetcher = new FakeCrawlFetcher({ pages: pages ?? new Map() });
  const store = new InMemorySnapshotStore();
  const adapter = new ScriptedAdapter(
    overrides.scripted ?? [entityResolutionJson(), personasModelingJson()],
  );
  return {
    input: {
      siteUrl: overrides.siteUrl ?? HOME_URL,
      brand: { brand_id: "brand_voltyet", name: "VoltYet" },
      market: { country: "AU", language: "en" },
      crawl: overrides.crawl,
      graph_version: overrides.graphVersion,
    },
    deps: {
      fetcher,
      snapshotStore: store,
      clock: new FakeClock(),
      adapter,
      retry: RETRY,
      keywordProvider: overrides.keywordProvider ?? defaultKeywordProvider(),
      spotCheckRunner: overrides.spotCheckRunner ?? new FakeSpotCheckRunner(DEFAULT_SPOT_CHECK_ANSWERS),
    },
    fetcher,
    store,
    adapter,
  };
}

/** High for camping research, medium for price comparisons, low for long tails. */
function defaultKeywordProvider(): KeywordVolumeSource {
  return new FakeKeywordProvider((keyword) => {
    if (keyword.includes("price") || keyword.includes("cheapest")) return "medium";
    if (keyword.includes("alternative") || keyword.includes("ban")) return "low";
    return "high";
  });
}

describe("runStageA — fixture crawl to validated graph", () => {
  it("produces a schema-valid graph with evidence URLs populated", async () => {
    const h = harness();
    const outcome = await runStageA(h.input, h.deps);
    if (!outcome.ok) {
      throw new Error(`expected a graph, got ${outcome.reason}: ${outcome.detail}`);
    }

    const graph = MarketingGraphSchema.parse(outcome.graph);
    expect(graph.brand_id).toBe("brand_voltyet");
    expect(graph.business_model).toBe("dtc");
    expect(graph.data_mode).toBe("llm_estimated");

    // Every node carries evidence; the crawl-registry URLs flow through.
    const traitEvidence = (trait: { evidence_urls: string[] }): string[] => trait.evidence_urls;
    const allEvidenceUrls = [
      ...graph.value_proposition.evidence_urls,
      ...graph.moats.flatMap(traitEvidence),
      ...graph.competitors.flatMap((competitor) => competitor.evidence_urls),
      ...graph.personas.flatMap((persona) => [
        ...traitEvidence(persona.demographics),
        ...persona.core_frustrations.flatMap(traitEvidence),
        ...persona.cognitive_biases.flatMap(traitEvidence),
        ...persona.decision_triggers.flatMap(traitEvidence),
        ...traitEvidence(persona.ai_language_fingerprint),
      ]),
      ...graph.scenarios.flatMap((scenario) => scenario.description.evidence_urls),
      ...graph.intent_topics.flatMap((topic) => topic.evidence_urls),
    ];
    expect(allEvidenceUrls.length).toBeGreaterThan(0);
    for (const url of allEvidenceUrls) {
      expect(url.startsWith(SITE)).toBe(true);
    }

    // Competitors: six resolved from the fixture, deduped and stable.
    expect(graph.competitors.length).toBe(6);
    expect(graph.competitors[0]?.brand_id).toMatch(/^brand_/);
    expect(graph.competitors.every((competitor) => competitor.data_mode === "llm_estimated")).toBe(true);

    // Personas: three MECE personas with the six standard fields, stable ids.
    expect(graph.personas.length).toBe(3);
    expect(graph.personas[0]?.persona_id).toBe("persona_the_weekend_overlander");
    expect(graph.personas[0]?.core_frustrations.length).toBeGreaterThan(0);

    // Scenario edges: one per type per persona, 9 total, each tied to its persona.
    expect(graph.scenarios.length).toBe(9);
    const firstPersonaScenarios = graph.scenarios.filter(
      (scenario) => scenario.persona_id === graph.personas[0]?.persona_id,
    );
    expect(firstPersonaScenarios.map((scenario) => scenario.scenario_type)).toEqual([
      "daily_pain",
      "acute_trigger",
      "final_shelf_comparison",
    ]);

    // Intent topics: tiers only (no copyable volume numbers), raw dimensions
    // + per-dimension data_mode stored alongside the derived tier.
    expect(graph.intent_topics.length).toBe(3);
    const camping = graph.intent_topics.find((topic) => topic.intent_name === "portable power station for camping");
    expect(camping?.priority).toBe("S");
    expect(camping?.volume.tier).toBe("high");
    expect(camping?.volume.monthly_volume).toBeNull();
    expect(camping?.volume.data_mode).toBe("llm_estimated");
    expect(camping?.fit.score).toBe(0.85);
    expect(camping?.fit.data_mode).toBe("llm_estimated");
    expect(camping?.gap.void_rate_pct).toBe(70);
    expect(camping?.gap.data_mode).toBe("llm_simulated");
    expect(camping?.evidence_urls.length).toBeGreaterThan(0);

    // The A topic: demand with entrenched competitors; the B topic: long tail.
    const pricing = graph.intent_topics.find((topic) => topic.intent_name === "power station price comparison");
    expect(pricing?.priority).toBe("A");
    const alternative = graph.intent_topics.find((topic) => topic.intent_name.startsWith("quiet generator"));
    expect(alternative?.priority).toBe("B");

    // Graph-level provenance stamped from the A.1 model response.
    expect(graph.provenance.source).toBe("fixture-model");
    expect(graph.generated_at).toBe("1970-01-01T00:00:00.000Z");
    expect(outcome.report.pages_crawled).toBe(6);
    expect(outcome.report.graph_id).toBe("graph_voltyet");
    expect(outcome.report.spot_check.void_rate_pct).toBe(70);
    expect(outcome.report.evidence_pages_cited).toBeGreaterThanOrEqual(3);
  });

  it("runs on recorded fixtures only — the scripted adapter sees exactly two calls", async () => {
    const h = harness();
    await runStageA(h.input, h.deps);
    expect(h.adapter.requests.length).toBe(2);
    // The entity pass prompt carries the evidence registry extracted from the crawl.
    expect(h.adapter.requests[0]?.user).toContain("Evidence extracted from");
    expect(h.adapter.requests[0]?.system).toContain("assumption");
  });

  it("is deterministic: identical fixture inputs produce an identical graph", async () => {
    const first = await runStageA(harness().input, harness().deps);
    const second = await runStageA(harness().input, harness().deps);
    if (!first.ok || !second.ok) {
      throw new Error("both runs should succeed on the happy-path fixture");
    }
    expect(JSON.stringify(second.graph)).toBe(JSON.stringify(first.graph));
  });
});

describe("runStageA — typed failures, no graph", () => {
  it("fails loudly when the graph cannot cite enough pages (low-evidence floor)", async () => {
    // A single sparse page: extraction succeeds, the model can only cite that page,
    // so the assembled graph cites one URL — below the three-page floor.
    const sparsePages = new Map<string, string>([
      [HOME_URL, "<!doctype html><html><head><title>VoltYet</title></head><body><p>Power stations.</p></body></html>"],
    ]);
    const fetcher = new FakeCrawlFetcher({ pages: sparsePages });
    const adapter = new ScriptedAdapter([
      JSON.stringify({
        business_model: "dtc",
        value_proposition: { text: "Portable power stations.", evidence_urls: [HOME_URL] },
        moats: [],
        competitors: [
          { name: "RivalOne", relation: "direct", claims: [], evidence_urls: [HOME_URL] },
        ],
        spot_check_prompts: Array.from(
          { length: 10 },
          (_, index) => `What is the best portable power station option ${index}?`,
        ),
      }),
      JSON.stringify({
        personas: [
          {
            archetype: "The Camper",
            demographics: { text: "Camps on weekends.", evidence_urls: [HOME_URL] },
            core_frustrations: [{ text: "Runtime claims feel inflated.", evidence_urls: [HOME_URL] }],
            cognitive_biases: [{ text: "Prefers familiar brands.", evidence_urls: [HOME_URL] }],
            decision_triggers: [{ text: "A dead fridge battery triggers the search.", evidence_urls: [HOME_URL] }],
            ai_language_fingerprint: { text: "Short urgent questions about runtime.", evidence_urls: [HOME_URL] },
            scenarios: [
              { scenario_type: "daily_pain", description: { text: "Charges devices nightly.", evidence_urls: [HOME_URL] } },
              { scenario_type: "acute_trigger", description: { text: "Fridge dies on night one.", evidence_urls: [HOME_URL] } },
              { scenario_type: "final_shelf_comparison", description: { text: "Compares two units on weight.", evidence_urls: [HOME_URL] } },
            ],
          },
        ],
        intent_topics: [
          {
            intent_name: "portable power station",
            buyer_stage: "Solution Research",
            intent_category: "Solution Research",
            keywords: ["portable power station"],
            fit: { score: 0.8, evidence_urls: [HOME_URL] },
            evidence_urls: [HOME_URL],
          },
        ],
      }),
    ]);
    const outcome = await runStageA(
      { siteUrl: HOME_URL, brand: { brand_id: "brand_voltyet", name: "VoltYet" }, market: { country: "AU", language: "en" } },
      {
        fetcher,
        snapshotStore: new InMemorySnapshotStore(),
        clock: new FakeClock(),
        adapter,
        retry: RETRY,
        keywordProvider: defaultKeywordProvider(),
        spotCheckRunner: new FakeSpotCheckRunner(DEFAULT_SPOT_CHECK_ANSWERS),
      },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("insufficient_evidence");
      expect(outcome.detail).toContain("at least 3");
    }
  });

  it("maps a non-retryable transport failure to llm_unavailable", async () => {
    const h = harness({ scripted: [new LlmError("auth", "invalid api key", false)] });
    const outcome = await runStageA(h.input, h.deps);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("llm_unavailable");
      expect(outcome.detail).toContain("invalid api key");
    }
  });

  it("exhausts the retry budget on garbage model output and fails as llm_invalid_output", async () => {
    const h = harness({ scripted: ["this is not json at all", "still not json", "nope"] });
    const outcome = await runStageA(h.input, h.deps);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("llm_invalid_output");
    }
  });

  it("maps a robots-blocked seed to crawl_robots_blocked", async () => {
    const h = harness();
    h.deps.fetcher = new FakeCrawlFetcher({
      pages: fixtureSitePages(),
      disallowed: [""],
    });
    const outcome = await runStageA(h.input, h.deps);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("crawl_robots_blocked");
    }
  });

  it("maps an off-domain seed redirect to domain_violation", async () => {
    const h = harness({ siteUrl: HOME_URL });
    h.deps.fetcher = new FakeCrawlFetcher({
      pages: fixtureSitePages(),
      redirect: new Map([[HOME_URL, "https://rival-one.example/"]]),
    });
    const outcome = await runStageA(h.input, h.deps);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("domain_violation");
      expect(outcome.detail).toContain("rival-one.example");
    }
  });

  it("fails with modeling_empty when every persona drops", async () => {
    // Personas output whose claims all cite URLs outside the registry —
    // every persona drops, no graph can exist.
    const hallucinated = personasModelingJson().replaceAll(SITE, "https://not-the-site.example");
    const h = harness({ scripted: [entityResolutionJson(), hallucinated] });
    const outcome = await runStageA(h.input, h.deps);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("modeling_empty");
      expect(outcome.dropped.length).toBeGreaterThan(0);
    }
  });
});

describe("runStageA — crawl cap from project config", () => {
  it("enforces the 50-page default cap and never fetches the 51st page", async () => {
    const pages = cappedSite(60);
    const fetcher = new FakeCrawlFetcher({ pages });
    const outcome = await runStageA(
      { siteUrl: HOME_URL, brand: { brand_id: "brand_voltyet", name: "VoltYet" }, market: { country: "AU", language: "en" } },
      {
        fetcher,
        snapshotStore: new InMemorySnapshotStore(),
        clock: new FakeClock(),
        adapter: new ScriptedAdapter([entityResolutionJson(), personasModelingJson()]),
        retry: RETRY,
        keywordProvider: defaultKeywordProvider(),
        spotCheckRunner: new FakeSpotCheckRunner(DEFAULT_SPOT_CHECK_ANSWERS),
      },
    );
    if (!outcome.ok) {
      throw new Error(`expected a graph, got ${outcome.reason}: ${outcome.detail}`);
    }
    expect(outcome.report.pages_crawled).toBe(50);
    // Exactly 50 pages attempted — the six content pages first (priority
    // classes), then catalog items in the class's deterministic URL-tiebreak
    // order (item-1, item-10, … — lexicographic, so 44 items fill the cap).
    expect(fetcher.attempted.length).toBe(50);
    expect(new Set(fetcher.attempted.slice(0, 6))).toEqual(new Set(FIXTURE_URLS));
    const orderedItems = Array.from({ length: 60 }, (_, i) => `${SITE}/catalog/item-${i + 1}`).sort();
    expect(fetcher.attempted).toContain(orderedItems[43]);
    expect(fetcher.attempted).not.toContain(orderedItems[44]);
  });

  it("raises the cap to 100 for weekly-iteration projects", async () => {
    const pages = cappedSite(120);
    const fetcher = new FakeCrawlFetcher({ pages });
    const outcome = await runStageA(
      {
        siteUrl: HOME_URL,
        brand: { brand_id: "brand_voltyet", name: "VoltYet" },
        market: { country: "AU", language: "en" },
        crawl: { weekly_iteration: true },
      },
      {
        fetcher,
        snapshotStore: new InMemorySnapshotStore(),
        clock: new FakeClock(),
        adapter: new ScriptedAdapter([entityResolutionJson(), personasModelingJson()]),
        retry: RETRY,
        keywordProvider: defaultKeywordProvider(),
        spotCheckRunner: new FakeSpotCheckRunner(DEFAULT_SPOT_CHECK_ANSWERS),
      },
    );
    if (!outcome.ok) {
      throw new Error(`expected a graph, got ${outcome.reason}: ${outcome.detail}`);
    }
    expect(outcome.report.pages_crawled).toBe(100);
    expect(fetcher.attempted.length).toBe(100);
    // 94 of the 120 items fit under the raised cap; the boundary follows the
    // class's lexicographic URL order (item-1, item-10, item-100, …).
    const orderedItems = Array.from({ length: 120 }, (_, i) => `${SITE}/catalog/item-${i + 1}`).sort();
    expect(fetcher.attempted).toContain(orderedItems[93]);
    expect(fetcher.attempted).not.toContain(orderedItems[94]);
  });
});
