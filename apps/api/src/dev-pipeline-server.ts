/**
 * Pipeline v2 dogfood entrypoint: the real /v2 orchestration surface backed
 * by the same simulated seams the tests use — recorded Stage A/B responses,
 * an in-memory crawl fetcher, canned monitoring answers, in-memory snapshot
 * store. No Shopify credentials, no outbound network, no live LLM.
 *
 * All three review gates are enabled so the full onboarding → Gate 1 →
 * Gate 2 → Gate 3 walk is exercisable from the web UI.
 *
 * Start: pnpm --filter @intentvisible/api dev:pipeline  (PORT defaults to
 * 4310 — the web dev server proxies /pipeline-api/* there). Seed the dogfood
 * by onboarding https://voltyet.example/ in the UI: the crawl fetcher serves
 * the recorded VoltYet pages for that host.
 */

import type { FastifyInstance } from "fastify";

import {
  DEFAULT_SPOT_CHECK_ANSWERS,
  entityResolutionJson,
  FakeCrawlFetcher,
  FakeKeywordProvider,
  FakeSpotCheckRunner,
  fixtureSitePages,
  HOME_URL,
  InMemorySnapshotStore,
  personasModelingJson,
} from "@intentvisible/intent-engine/testing/stage-a";
import {
  evidencedClaimTexts,
  expansionJson,
  fixtureGraph,
} from "@intentvisible/intent-engine/testing/stage-b";
import {
  selectIntents,
  type LlmAdapter,
  type LlmRequest,
  type LlmResponse,
} from "@intentvisible/intent-engine";
import { SystemClock } from "@intentvisible/url-extractor";

import { buildApp } from "./app.js";
import { AnalyzePipeline } from "./pipeline.js";
import { PipelineOrchestrator } from "./orchestration/pipeline.js";
import { MemoryPipelineStore } from "./orchestration/store.js";
import { InProcessQueue } from "./queue.js";
import { MemoryJobStore, MemoryLibraryStore } from "./store.js";

/** Six distinct buyer questions per batch intent — the recorded expansion responses carry these. */
const PROMPT_TEXTS = [
  // Camping Fridge Runtime
  "which portable power station can run my camping fridge for two nights",
  "best battery generator for a 12v fridge on a camping trip",
  "how long will a 500wh power station run a car fridge",
  "quiet power station for fridge and lights at a campground",
  "portable power station that recharges by solar while camping",
  "can a portable power station handle a fridge plus led lights overnight",
  // Solar Panel Compatibility
  "which power stations accept third party solar panels",
  "portable power station with mppt solar input",
  "can i mix solar panel brands with my power station",
  "fastest solar recharge portable power station",
  "solar generator bundle for off grid weekends",
  "power station that charges from solar in four hours",
  // Emergency Backup
  "home backup battery that keeps the wifi and fridge on",
  "portable power station for power outage essentials",
  "indoor safe backup power no fumes",
  "power station that switches on automatically during an outage",
  "backup power for a sump pump during a storm",
  "quiet home backup battery alternative to a gas generator",
];

/** A canned "brand visible" monitoring answer — the simulated runners parse these.
 *  It names the brand by the alias the dogfood project carries (the URL host).
 */
const VISIBLE_MONITORING_ANSWER =
  "For camping power I recommend voltyet.example — its portable power station is the most reliable option for a camping fridge and overnight lights. Details: https://voltyet.example/pages/portable-power-stations";

/**
 * Serves the recorded response for whatever call type arrives — entity
 * resolution, personas, one expansion per batch intent (in batch order),
 * and the canned monitoring answer for everything else. Type-aware rather
 * than queue-ordered, so multiple projects (and re-baselines) walk the
 * same dogfood without the script running out of step.
 */
class DogfoodAdapter implements LlmAdapter {
  private expansionIndex = 0;

  constructor(
    private readonly entity: string,
    private readonly personas: string,
    private readonly expansions: readonly string[],
    private readonly monitoring: () => string,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (request.system.includes("resolving a brand's entity")) {
      this.expansionIndex = 0; // a new baseline begins
      return { text: this.entity, model: "fixture-model" };
    }
    if (request.system.includes("modeling personas and intent topics")) {
      return { text: this.personas, model: "fixture-model" };
    }
    if (request.system.includes("writing the exact questions real buyers type")) {
      const text = this.expansions[this.expansionIndex % this.expansions.length];
      this.expansionIndex += 1;
      if (text === undefined) {
        return { text: this.monitoring(), model: "fixture-model" };
      }
      return { text, model: "fixture-model" };
    }
    return { text: this.monitoring(), model: "fixture-model" };
  }
}

async function baselineResponses(): Promise<{ entity: string; personas: string; expansions: string[] }> {
  const graph = await fixtureGraph();
  const batch = selectIntents(graph).batch;
  const claims = evidencedClaimTexts(graph, 6);
  return {
    entity: entityResolutionJson(),
    personas: personasModelingJson(),
    expansions: batch.map((_, index) =>
      expansionJson({ texts: PROMPT_TEXTS.slice(index * 6, index * 6 + 6), claims }),
    ),
  };
}

async function main(): Promise<void> {
  const store = new MemoryPipelineStore();
  const responses = await baselineResponses();
  const adapter = new DogfoodAdapter(responses.entity, responses.personas, responses.expansions, () =>
    VISIBLE_MONITORING_ANSWER,
  );
  const orchestrator = new PipelineOrchestrator({
    store,
    queue: new InProcessQueue(1),
    clock: new SystemClock(),
    llmAdapter: adapter,
    fetcher: new FakeCrawlFetcher({ pages: fixtureSitePages() }),
    snapshotStore: new InMemorySnapshotStore(),
    keywordProvider: new FakeKeywordProvider((keyword) =>
      keyword.includes("price") || keyword.includes("cheapest")
        ? "medium"
        : keyword.includes("alternative") || keyword.includes("ban")
          ? "low"
          : "high",
    ),
    spotCheckRunner: new FakeSpotCheckRunner(DEFAULT_SPOT_CHECK_ANSWERS),
    log: (event) => console.log(`[orchestrator] ${event}`),
  });

  // Dogfood default: every gate on, so the web flow walks all three reviews.
  // Bind the original first — the override replaces the instance property.
  const createProject = orchestrator.createProject.bind(orchestrator);
  const dogfoodOrchestrator = Object.assign(orchestrator, {
    createProject: (input: Parameters<PipelineOrchestrator["createProject"]>[0]) =>
      createProject({ ...input, gate_config: { 1: true, 2: true, 3: true } }),
  });

  // The v1 analyze surface composes exactly like dev-fixture-server so the
  // shared app factory is complete; the pipeline dogfood never calls it.
  const jobStore = new MemoryJobStore();
  const libraryStore = new MemoryLibraryStore();
  const queue = new InProcessQueue(1);
  const analyzePipeline = new AnalyzePipeline({
    jobStore,
    libraryStore,
    queue,
    extractorDeps: {
      clock: new SystemClock(),
      fetchImpl: fetch,
      snapshotStore: new InMemorySnapshotStore(),
    },
    llmAdapter: adapter,
  });

  const app: FastifyInstance = buildApp({
    pipeline: analyzePipeline,
    jobStore,
    libraryStore,
    orchestration: { orchestrator: dogfoodOrchestrator, store },
  });
  const port = Number(process.env.PORT ?? 4310);
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`intent-visible pipeline dogfood api listening on :${port}`);
  console.log(`  onboarding url: ${HOME_URL} (fixture site, crawl is simulated)`);
  console.log("  gates: 1/2/3 enabled — approve or reject-with-note from the web UI.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
