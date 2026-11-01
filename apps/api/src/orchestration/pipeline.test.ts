/**
 * Pipeline v2 orchestration integration tests (task todo_78GYjwoc; blueprint
 * verifications #6, #8, #9, #10, #12). The real orchestrator runs over the
 * fixture site with in-memory fakes at every seam — recorded LLM responses,
 * in-memory fetcher/snapshot store, a controllable clock. No live LLM, no
 * crawl, no network.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { PLATFORMS } from "@intentvisible/core-schema";
import {
  selectIntents,
  type Clock,
  type LlmAdapter,
  type LlmRequest,
  type LlmResponse,
  type MonitoringPlan,
} from "@intentvisible/intent-engine";
import { SimulatedMonitoringRunner } from "@intentvisible/data-providers";
import {
  DEFAULT_SPOT_CHECK_ANSWERS,
  FakeCrawlFetcher,
  FakeKeywordProvider,
  FakeSpotCheckRunner,
  InMemorySnapshotStore,
  entityResolutionJson,
  fixtureSitePages,
  HOME_URL,
  personasModelingJson,
} from "@intentvisible/intent-engine/testing/stage-a";
import {
  evidencedClaimTexts,
  expansionJson,
  fixtureGraph,
} from "@intentvisible/intent-engine/testing/stage-b";

import { InProcessQueue } from "../queue.js";
import { nextRunAt, PipelineOrchestrator, ProjectValidationError } from "./pipeline.js";
import { bumpPublishedRecord } from "./publish.js";
import { MemoryPipelineStore } from "./store.js";
import {
  aliasConfigFromGraph,
  executeMonitoring,
  PlanDataModeMismatchError,
} from "./stage-c.js";
import { GATE_TIMEOUT_HOURS, type PipelineRecord } from "./types.js";
import { monthKeyOf } from "./usage.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const SITE = HOME_URL;
const BRAND_NAME = "VoltYet";
/** 2026-11-01T00:00:00Z — a fixed, realistic test epoch. */
const BASE_MS = Date.UTC(2026, 10, 1);
const HOUR_MS = 3600_000;

/**
 * Eighteen genuinely different buyer questions — six per fixture intent
 * (within the 5–7 per-intent band, pairwise overlap far below the 0.5
 * collapse bar, and disjoint sets across intents because dedup partitions
 * by market, not intent).
 */
const PROMPT_TEXTS = [
  "I need a power station that runs my camping fridge through two full nights without a recharge — which one holds up?",
  "Last trip my fridge died because the station cut out early; what should I check before my next purchase?",
  "Which station would you recommend for weekend family camping with just a cooler and some lights?",
  "Can a single portable unit realistically keep phones, a 12V fridge, and a lantern running at once?",
  "How much capacity do I actually need for a weekend away so the fridge never dies overnight?",
  "Will one battery handle an esky fridge plus phone charging across three days off-grid?",
  "Which portable station is quiet enough to run at a powered campsite with close neighbours?",
  "How many watt-hours should I budget for boiling a kettle twice a day while touring?",
  "Do I need a separate solar blanket, or can the station top up from the car while I drive?",
  "Which brand shows the clearest battery percentage readout so I am never guessing at camp?",
  "Is paying extra for a built-in inverter worth it if I want to run my coffee machine?",
  "What is the lightest setup that still powers a CPAP machine for two nights in a tent?",
  "Are portable power stations actually worth the money compared with a small petrol generator?",
  "How do I work out the right size station for running a fridge and charging cameras on day trips?",
  "Which power stations hold their charge longest in storage between camping trips?",
  "What should I look for in the warranty when I buy a portable power station?",
  "Can I leave a power station on solar charge all day while the fridge runs at night?",
  "Which stations are safest to use inside a camper van with kids around?",
] as const;

/** The baseline answers every monitoring run with a brand-visible reply. */
const VISIBLE_ANSWER =
  "I recommend VoltYet — the VoltYet 500 is the most reliable portable power station for camping. Details: https://voltyet.example/pages/portable-power-stations";
/** The drift-cycle answers never mention the brand. */
const HIDDEN_ANSWER =
  "For camping power I would compare RivalOne and RivalTwo at any outdoor retailer before deciding.";

/** Controllable clock: time only moves when the test moves it. */
class TestClock implements Clock {
  constructor(private now: number = BASE_MS) {}
  nowMs(): number {
    return this.now;
  }
  isoNow(): string {
    return new Date(this.now).toISOString();
  }
  async sleep(ms: number): Promise<void> {
    this.now += ms;
  }
  advance(ms: number): void {
    this.now += ms;
  }
  advanceTo(ms: number): void {
    this.now = ms;
  }
}

/**
 * Serves the scripted baseline queue (recorded Stage A/B responses), then
 * falls back to canned monitoring answers for every later call. The answer
 * ref is shared mutable state the test flips to simulate drift.
 */
class PipelineTestAdapter implements LlmAdapter {
  private scripted: Array<string | Error>;
  private readonly initial: readonly (string | Error)[];
  calls = 0;

  constructor(
    scripted: readonly string[],
    private readonly monitoringAnswer: () => string,
  ) {
    this.scripted = [...scripted];
    this.initial = [...scripted];
  }

  /** Restarts the recorded Stage A/B script for a second baseline (re-baseline test). */
  replay(): void {
    this.scripted = [...this.initial];
  }

  async complete(_request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    const next = this.scripted.shift();
    if (next !== undefined) {
      if (next instanceof Error) {
        throw next;
      }
      return { text: next, model: "fixture-model" };
    }
    return { text: this.monitoringAnswer(), model: "fixture-model" };
  }
}

// ── Harness ─────────────────────────────────────────────────────────────────

const tierProvider = (): FakeKeywordProvider =>
  new FakeKeywordProvider((keyword) =>
    keyword.includes("price") || keyword.includes("cheapest")
      ? "medium"
      : keyword.includes("alternative") || keyword.includes("ban")
        ? "low"
        : "high",
  );

interface Harness {
  clock: TestClock;
  store: MemoryPipelineStore;
  queue: InProcessQueue;
  orchestrator: PipelineOrchestrator;
}

function makeHarness(adapter: LlmAdapter, inject: { clock?: TestClock } = {}): Harness {
  const clock = inject.clock ?? new TestClock();
  const store = new MemoryPipelineStore();
  const queue = new InProcessQueue(1);
  const orchestrator = new PipelineOrchestrator({
    store,
    queue,
    clock,
    llmAdapter: adapter,
    fetcher: new FakeCrawlFetcher({ pages: fixtureSitePages() }),
    snapshotStore: new InMemorySnapshotStore(),
    keywordProvider: tierProvider(),
    spotCheckRunner: new FakeSpotCheckRunner(DEFAULT_SPOT_CHECK_ANSWERS),
  });
  return { clock, store, queue, orchestrator };
}

/** Drains the queue and returns the pipeline record (any status). */
async function drainPipeline(h: Harness, pipelineId: string): Promise<PipelineRecord> {
  await h.queue.drain();
  const pipeline = await h.store.getPipeline(pipelineId);
  if (pipeline === null) {
    throw new Error(`pipeline ${pipelineId} disappeared during the run`);
  }
  return pipeline;
}

async function createAndStart(
  h: Harness,
  options: { gate1?: boolean; cadence?: "weekly" | "monthly"; cap?: number | null } = {},
): Promise<PipelineRecord> {
  const project = await h.orchestrator.createProject({
    brand_name: BRAND_NAME,
    site_url: SITE,
    trigger: "site_url",
    gate_config: options.gate1 === true ? { 1: true } : undefined,
    cadence: options.cadence ?? "monthly",
    monthly_llm_request_cap: options.cap ?? null,
  });
  return await h.orchestrator.startPipeline(project.project_id, "site_url");
}

/**
 * The recorded Stage A + Stage B response script for one full baseline: two
 * Stage A calls plus one expansion response per selected batch intent.
 * Built from a probe fixture graph — Stage A is deterministic, so the
 * pipeline's own selection matches this probe's batch.
 */
async function baselineScript(): Promise<string[]> {
  const graph = await fixtureGraph();
  const batch = selectIntents(graph).batch;
  const claims = evidencedClaimTexts(graph, 6);
  return [
    entityResolutionJson(),
    personasModelingJson(),
    ...batch.map((_, index) =>
      expansionJson({
        texts: PROMPT_TEXTS.slice(index * 6, index * 6 + 6),
        claims,
      }),
    ),
  ];
}

let script: string[];
beforeAll(async () => {
  script = await baselineScript();
});

/** A harness whose pipeline runs to completion (or parks at a gate). */
async function runBaseline(
  options: {
    answers?: { text: string };
    gate1?: boolean;
    cadence?: "weekly" | "monthly";
    cap?: number | null;
    clock?: TestClock;
  } = {},
): Promise<Harness & { adapter: PipelineTestAdapter; projectId: string; pipeline: PipelineRecord }> {
  const answers = options.answers ?? { text: VISIBLE_ANSWER };
  const adapter = new PipelineTestAdapter(script, () => answers.text);
  const h = makeHarness(adapter, { clock: options.clock });
  const pipeline = await createAndStart(h, options);
  return {
    ...h,
    adapter,
    projectId: projectOf(h, pipeline),
    pipeline: await drainPipeline(h, pipeline.pipeline_id),
  };
}

function projectOf(h: Harness, pipeline: PipelineRecord): string {
  return pipeline.project_id;
}

// ── Gates (verification #9) ─────────────────────────────────────────────────

describe("gate orchestration", () => {
  it("gates off: runs the full state machine to complete and creates zero gate reviews", async () => {
    const h = await runBaseline();

    expect(h.pipeline.status).toBe("complete");
    expect(h.pipeline.status_history.map((entry) => entry.status)).toEqual([
      "installed",
      "crawling",
      "research",
      "modeling",
      "estimating",
      "selecting",
      "expanding",
      "monitoring",
      "computing",
      "complete",
    ]);
    expect(h.pipeline.published).toBe(true);
    expect(await h.store.listGateReviews({ projectId: h.projectId })).toEqual([]);
  });

  it("enabled gate: opens one review with a 72h timeout; silence records auto_approved and completes", async () => {
    const h = makeHarness(new PipelineTestAdapter(script, () => VISIBLE_ANSWER));
    const pipeline = await createAndStart(h, { gate1: true });
    await h.queue.drain();

    const parked = await h.store.getPipeline(pipeline.pipeline_id);
    expect(parked?.status).toBe("pending_gate_1");
    const projectId = parked!.project_id;

    const reviews = await h.store.listGateReviews({ projectId });
    expect(reviews).toHaveLength(1);
    const review = reviews[0]!;
    expect(review.status).toBe("pending");
    expect(review.gate).toBe(1);
    expect(Date.parse(review.timeout_at) - Date.parse(review.created_at)).toBe(
      GATE_TIMEOUT_HOURS * HOUR_MS,
    );

    // Silence past the deadline: the tick auto-approves and the pipeline resumes.
    h.clock.advance((GATE_TIMEOUT_HOURS + 1) * HOUR_MS);
    const summary = await h.orchestrator.tick(h.clock.isoNow());
    expect(summary.gates_auto_approved).toBe(1);
    const final = await drainPipeline(h, pipeline.pipeline_id);
    expect(final.status).toBe("complete");
    expect(final.published).toBe(true);

    const decided = await h.store.getGateReview(review.review_id);
    expect(decided?.status).toBe("auto_approved");
    expect(decided?.decided_at).not.toBeNull();
  });
});

// ── Market change (verification #10) ────────────────────────────────────────

describe("market re-baselining", () => {
  it("a market change re-baselines into a separate market-scoped baseline without touching the old one", async () => {
    const first = await runBaseline();
    expect(first.pipeline.status).toBe("complete");
    const planAU = first.pipeline.plan_id;
    expect(planAU).not.toBeNull();

    const baselinesBefore = await first.store.listBaselines(first.projectId);
    expect(baselinesBefore).toHaveLength(1);
    expect(baselinesBefore[0]!.country).toBe("AU");
    expect(baselinesBefore[0]!.language).toBe("en");
    const metricsBefore = await first.store.getMetrics(planAU!);

    // The re-baseline re-runs Stage A + B: replay the recorded fixture
    // script so the second pipeline gets the same deterministic responses
    // (its monitoring calls fall through to the answer ref as usual).
    first.adapter.replay();
    const updated = await first.orchestrator.updateProject(first.projectId, { country: "US" });
    expect(updated.country).toBe("US");
    await first.queue.drain();

    const pipelines = await first.store.listPipelines(first.projectId);
    const rebaseline = pipelines[pipelines.length - 1]!;
    expect(rebaseline.pipeline_id).not.toBe(first.pipeline.pipeline_id);
    expect(rebaseline.status).toBe("complete");
    const planUS = rebaseline.plan_id;
    expect(planUS).not.toBeNull();
    expect(planUS).not.toBe(planAU);

    const baselinesAfter = await first.store.listBaselines(first.projectId);
    expect(baselinesAfter).toHaveLength(2);
    const usBaseline = baselinesAfter.find((record) => record.plan_id === planUS);
    expect(usBaseline?.country).toBe("US");
    expect(usBaseline?.language).toBe("en");

    // The AU baseline's recorded metrics are never mixed into or modified by
    // the US re-baseline.
    expect(await first.store.getMetrics(planAU!)).toEqual(metricsBefore);
  });
});

// ── Mixed-mode rejection (verification #6) ──────────────────────────────────

describe("data mode integrity", () => {
  it("rejects a mixed-mode monitoring plan with the typed error", async () => {
    const h = await runBaseline();
    const plan = await h.store.getPlan(h.pipeline.plan_id!);
    expect(plan).not.toBeNull();
    const graph = await h.store.getGraph((await h.store.getProject(h.projectId))!.brand_id);
    expect(graph).not.toBeNull();
    const prompts = await h.store.getPrompts((await h.store.getProject(h.projectId))!.brand_id);
    expect(prompts.length).toBeGreaterThan(0);

    const measuredPlan: MonitoringPlan = { ...plan!, data_mode: "provider_measured" };
    const simulatedRunner = new SimulatedMonitoringRunner({
      adapter: new PipelineTestAdapter([], () => VISIBLE_ANSWER),
      clock: h.clock,
      platform: PLATFORMS[0],
      personaVersion: "monitor-skill/v1",
    });

    await expect(
      executeMonitoring({
        plan: measuredPlan,
        prompts,
        runners: [simulatedRunner],
        aliases: aliasConfigFromGraph(graph!, BRAND_NAME),
        clock: h.clock,
        rounds: 1,
      }),
    ).rejects.toBeInstanceOf(PlanDataModeMismatchError);
  });

  it("a measured-mode project without registered runners is rejected at creation", async () => {
    const h = makeHarness(new PipelineTestAdapter(script, () => VISIBLE_ANSWER));
    await expect(
      h.orchestrator.createProject({
        brand_name: BRAND_NAME,
        site_url: SITE,
        trigger: "site_url",
        data_mode: "measured",
      }),
    ).rejects.toBeInstanceOf(ProjectValidationError);
  });
});

// ── Publish provenance + version (verification #8) ──────────────────────────

describe("lib publish and versioning", () => {
  it("publish flips records to simulated with full provenance; drift bumps the version with fresh measurement", async () => {
    const answers = { text: VISIBLE_ANSWER };
    const h = await runBaseline({ answers });
    expect(h.pipeline.status).toBe("complete");

    const published = await h.store.listPublishedIntents(h.projectId);
    expect(published.length).toBeGreaterThan(0);
    for (const entry of published) {
      expect(entry.record.intent_version).toBe(1);
      expect(entry.record.measurement_status).toBe("simulated");
      expect(entry.record.measurement_provenance).toBeDefined();
      expect(entry.record.measurement_provenance?.model_id).toContain("fixture-model");
      expect(entry.record.measurement_provenance?.source).toBeTruthy();
      expect(entry.record.measurement_provenance?.date_range.from).toBeTruthy();
      expect(entry.record.measurement_provenance?.date_range.to).toBeTruthy();
    }

    // The next cycle's answers never mention the brand — visibility collapses
    // past the 10-point threshold, so the drifted intents are re-published
    // with a version bump and the cycle's own provenance.
    answers.text = HIDDEN_ANSWER;
    const schedule = await h.store.getScheduleForProject(h.projectId);
    expect(schedule?.status).toBe("active");
    h.clock.advanceTo(Date.parse(schedule!.next_run_at) + 1);
    const summary = await h.orchestrator.tick(h.clock.isoNow());
    expect(summary.cycles_run).toBe(1);

    const cycles = await h.store.listCycles(h.projectId);
    expect(cycles).toHaveLength(1);
    const cycle = cycles[0]!;
    expect(cycle.status).toBe("complete");
    expect(cycle.drift_events.length).toBeGreaterThan(0);
    expect(cycle.bumped_intents.length).toBe(cycle.drift_events.length);

    const afterBump = await h.store.listPublishedIntents(h.projectId);
    const bumpedEntry = afterBump.find(
      (entry) => entry.record.intent_id === cycle.bumped_intents[0]!.intent_id,
    );
    expect(bumpedEntry).toBeDefined();
    expect(bumpedEntry!.record.intent_version).toBe(2);
    expect(bumpedEntry!.record.measurement_status).toBe("simulated");
    expect(bumpedEntry!.record.visibility_pct).toBe(0);
    // Unbumped records keep their version.
    const unbumped = afterBump.filter(
      (entry) => !cycle.bumped_intents.some((bump) => bump.intent_id === entry.record.intent_id),
    );
    for (const entry of unbumped) {
      expect(entry.record.intent_version).toBe(1);
    }
  });

  it("bumpPublishedRecord raises the version and rewrites the measurement provenance", async () => {
    const h = await runBaseline();
    const pooled = (await h.store.getMetrics(h.pipeline.plan_id!)).find(
      (snapshot) => snapshot.prompt_id === undefined && snapshot.platform === undefined,
    );
    expect(pooled).toBeDefined();
    const entry = (await h.store.listPublishedIntents(h.projectId))[0]!;
    const before = entry.record.intent_version;

    const clock = new TestClock(BASE_MS + 5 * HOUR_MS);
    const bumped = bumpPublishedRecord(entry.record, pooled!, clock);
    expect(bumped.intent_version).toBe(before + 1);
    expect(bumped.measurement_status).toBe(
      pooled!.data_mode === "provider_measured" ? "measured" : "simulated",
    );
    expect(bumped.measurement_source).toBe(pooled!.provider_model);
    expect(bumped.measurement_provenance?.date_range).toEqual(pooled!.date_range);
    expect(bumped.generated_at).toBe(clock.isoNow());
  });
});

// ── Usage cap + cadence scheduling (verification #12) ───────────────────────

describe("usage cap and cadence scheduling", () => {
  it("hitting the monthly cap pauses the schedule with a notification and resumes later", async () => {
    // Weekly cadence keeps the first due date inside the baseline's calendar
    // month — a monthly schedule crosses into a fresh month, where usage
    // resets and the cap cannot bind.
    const h = await runBaseline({ cadence: "weekly" });
    expect(h.pipeline.status).toBe("complete");

    const used = await h.store.getUsage(h.projectId, monthKeyOf(h.clock.isoNow()));
    expect(used).toBeGreaterThan(0);

    // Cap the project at exactly what the baseline already used.
    await h.orchestrator.updateProject(h.projectId, { monthly_llm_request_cap: used });
    const schedule = await h.store.getScheduleForProject(h.projectId);
    h.clock.advanceTo(Date.parse(schedule!.next_run_at) + 1);

    const summary = await h.orchestrator.tick(h.clock.isoNow());
    expect(summary.cycles_paused).toBe(1);
    expect(summary.cycles_run).toBe(0);

    const paused = await h.store.getScheduleForProject(h.projectId);
    expect(paused?.status).toBe("paused");
    expect(paused?.pause_reason).toBeTruthy();
    const notifications = await h.store.listNotifications(h.projectId);
    expect(notifications.some((notification) => notification.kind === "usage_cap_reached")).toBe(
      true,
    );

    // Raise the cap, resume, cross into the next month: the cycle runs again.
    await h.orchestrator.updateProject(h.projectId, {
      monthly_llm_request_cap: used * 10,
    });
    const resumed = await h.orchestrator.resumeSchedule(h.projectId);
    expect(resumed.status).toBe("active");
    h.clock.advanceTo(Date.parse(resumed.next_run_at) + 1);
    const nextMonth = await h.orchestrator.tick(h.clock.isoNow());
    expect(nextMonth.cycles_run).toBe(1);
  });

  it("cadence: monthly default advances a calendar month, weekly opt-in advances 7 days", async () => {
    const sharedClock = new TestClock();

    const monthly = await runBaseline({ cadence: "monthly", clock: sharedClock });
    expect(monthly.pipeline.status).toBe("complete");
    const monthlySchedule = await monthly.store.getScheduleForProject(monthly.projectId);
    expect(monthlySchedule?.cadence).toBe("monthly");
    expect(monthlySchedule?.next_run_at).toBe(nextRunAt(sharedClock.isoNow(), "monthly"));

    // Not due yet — a tick before next_run_at runs nothing.
    const idle = await monthly.orchestrator.tick(sharedClock.isoNow());
    expect(idle.cycles_run).toBe(0);
    expect(await monthly.store.listCycles(monthly.projectId)).toHaveLength(0);

    const weekly = await runBaseline({ cadence: "weekly", clock: sharedClock });
    expect(weekly.pipeline.status).toBe("complete");
    const weeklySchedule = await weekly.store.getScheduleForProject(weekly.projectId);
    expect(weeklySchedule?.cadence).toBe("weekly");
    expect(weeklySchedule?.next_run_at).toBe(nextRunAt(sharedClock.isoNow(), "weekly"));

    // Six days later: still not due.
    sharedClock.advance(6 * 24 * HOUR_MS);
    const almost = await weekly.orchestrator.tick(sharedClock.isoNow());
    expect(almost.cycles_run).toBe(0);

    // One more day: the weekly schedule is due and the cycle runs.
    sharedClock.advance(24 * HOUR_MS + 1);
    const due = await weekly.orchestrator.tick(sharedClock.isoNow());
    expect(due.cycles_run).toBe(1);
  });
});
