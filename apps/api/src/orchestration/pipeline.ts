/**
 * Pipeline v2 orchestrator (blueprint section 4): walks the install-triggered
 * state machine over the v1 analyze queue — installed → crawling → research →
 * modeling → estimating → (Gate 1) → selecting → expanding → (Gate 2) →
 * monitoring → computing → (Gate 3) → complete — pausing at enabled gates
 * (72h timeout, silence records auto_approved) and mapping every stage
 * failure onto the typed failure vocabulary. Also owns the recurring
 * monitoring scheduler (monthly default / weekly opt-in), the per-project
 * monthly usage cap (pause + notify, never silent), market re-baselining
 * (a market edit starts a fresh baseline; markets never mix), and the
 * lib publish with provenance + version bumps.
 */

import { randomUUID } from "node:crypto";

import {
  CountryCodeSchema,
  LanguageCodeSchema,
  UrlSchema,
} from "@intentvisible/core-schema";
import {
  runStageA,
  runStageB,
  slugify,
  type Clock,
  type KeywordVolumeSource,
  type LlmAdapter,
  type MonitoringPlan,
  type SpotCheckRunner,
  type StageAFailureReason,
  type StageBFailureReason,
} from "@intentvisible/intent-engine";
import { MixedDataModeError } from "@intentvisible/intent-lib-export";
import type { MonitoringRunner } from "@intentvisible/data-providers";
import type { UrlFetcher, SnapshotStore } from "@intentvisible/url-extractor";

import type { AnalyzeQueue } from "../queue.js";
import { detectDrift, visibilityByIntent } from "./drift.js";
import { buildPublish, bumpPublishedRecord } from "./publish.js";
import {
  aliasConfigFromGraph,
  executeMonitoring,
  PlanDataModeMismatchError,
  RunnerMissingError,
} from "./stage-c.js";
import { resolveRunnersForDataMode, resolveSimulatedRunners } from "./runners.js";
import type { PipelineStore } from "./store.js";
import { assertWithinUsageCap, countingAdapter, UsageCapExceeded } from "./usage.js";
import {
  canTransition,
  GATE_TIMEOUT_HOURS,
  type GateConfig,
  type GateDecision,
  type GateNumber,
  type GateReviewRecord,
  type MonitoringCycleRecord,
  type MonitoringScheduleRecord,
  type PipelineFailureReason,
  type PipelineProjectRecord,
  type PipelineRecord,
  type PipelineStatus,
  type PipelineTrigger,
} from "./types.js";

const DEFAULT_PERSONA_VERSION = "monitor-skill/v1";

/** A project/config request that violates the pipeline contract. */
export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectValidationError";
  }
}

/** The compile-time-checked stage → pipeline failure mapping (identity). */
const STAGE_FAILURE_MAP: Record<
  StageAFailureReason | StageBFailureReason,
  PipelineFailureReason
> = {
  crawl_robots_blocked: "crawl_robots_blocked",
  crawl_unreachable: "crawl_unreachable",
  domain_violation: "domain_violation",
  insufficient_evidence: "insufficient_evidence",
  modeling_empty: "modeling_empty",
  spot_check_failed: "spot_check_failed",
  estimation_failed: "estimation_failed",
  graph_invalid: "graph_invalid",
  selection_empty: "selection_empty",
  no_scenarios: "no_scenarios",
  expansion_underflow: "expansion_underflow",
  plan_invalid: "plan_invalid",
  llm_unavailable: "llm_unavailable",
  llm_invalid_output: "llm_invalid_output",
};

/** Maps an orchestration-layer error onto the typed failure vocabulary. */
function orchestrationFailure(error: unknown): {
  reason: PipelineFailureReason;
  detail: string;
} {
  if (error instanceof UsageCapExceeded) {
    return { reason: "usage_cap_reached", detail: error.message };
  }
  if (error instanceof PlanDataModeMismatchError || error instanceof MixedDataModeError) {
    return { reason: "data_mode_mismatch", detail: error.message };
  }
  if (error instanceof RunnerMissingError) {
    return { reason: "monitoring_failed", detail: error.message };
  }
  if (error instanceof ProjectValidationError) {
    return { reason: "invalid_request", detail: error.message };
  }
  return { reason: "internal_error", detail: error instanceof Error ? error.message : String(error) };
}

/** Next schedule run: +7 days for weekly, +1 calendar month for monthly. */
export function nextRunAt(fromIso: string, cadence: "weekly" | "monthly"): string {
  const from = new Date(fromIso);
  if (cadence === "weekly") {
    from.setUTCDate(from.getUTCDate() + 7);
  } else {
    from.setUTCMonth(from.getUTCMonth() + 1);
  }
  return from.toISOString();
}

export interface OrchestratorDeps {
  store: PipelineStore;
  queue: AnalyzeQueue;
  clock: Clock;
  /** The raw modeling adapter — wrapped per project with the usage counter. */
  llmAdapter: LlmAdapter;
  /** The v1 robots-aware fetcher edge Stage A crawls through. */
  fetcher: Pick<UrlFetcher, "fetchPage">;
  snapshotStore: SnapshotStore;
  /** Tier-only keyword demand provider (Stage A.3). */
  keywordProvider: KeywordVolumeSource;
  /** The Stage A.1 spot-check probe runner. */
  spotCheckRunner: SpotCheckRunner;
  /** Measured-mode runners, registered when an advanced provider is configured. */
  measuredRunners?: readonly MonitoringRunner[];
  /** Simulated runner persona version, pinned per baseline. */
  personaVersion?: string;
  /** Gate silence timeout in hours (blueprint default 72). */
  gateTimeoutHours?: number;
  log?: (event: string) => void;
}

export interface CreateProjectInput {
  brand_name: string;
  site_url: string;
  trigger: PipelineTrigger;
  /** Defaults: "AU" / "en" (the v1 default market). */
  country?: string;
  language?: string;
  gate_config?: Partial<GateConfig>;
  /** "llm" default; "measured" requires registered measured runners. */
  data_mode?: "llm" | "measured";
  /** Monthly monitoring cap; null/undefined = uncapped. */
  monthly_llm_request_cap?: number | null;
  /** "monthly" default; "weekly" is the opt-in. */
  cadence?: "weekly" | "monthly";
}

export interface UpdateProjectInput {
  brand_name?: string;
  site_url?: string;
  country?: string;
  language?: string;
  gate_config?: Partial<GateConfig>;
  data_mode?: "llm" | "measured";
  monthly_llm_request_cap?: number | null;
  cadence?: "weekly" | "monthly";
}

export interface TickSummary {
  gates_auto_approved: number;
  cycles_run: number;
  cycles_paused: number;
  cycles_failed: number;
}

function mergeGateConfig(base: GateConfig, patch?: Partial<GateConfig>): GateConfig {
  if (patch === undefined) {
    return { ...base };
  }
  return {
    1: patch[1] ?? base[1],
    2: patch[2] ?? base[2],
    3: patch[3] ?? base[3],
  };
}

function validateProjectInput(input: {
  brand_name: string;
  site_url: string;
  country: string;
  language: string;
  data_mode: "llm" | "measured";
  monthly_llm_request_cap: number | null;
  measuredRunnersRegistered: boolean;
}): { brand_id: string } {
  if (input.brand_name.trim().length === 0 || input.brand_name.length > 200) {
    throw new ProjectValidationError("brand_name must be 1-200 characters");
  }
  const slug = slugify(input.brand_name);
  if (slug.length === 0) {
    throw new ProjectValidationError(`brand_name "${input.brand_name}" has no slug characters`);
  }
  if (!UrlSchema.safeParse(input.site_url).success) {
    throw new ProjectValidationError(`site_url "${input.site_url}" is not a valid http(s) URL`);
  }
  if (!CountryCodeSchema.safeParse(input.country).success) {
    throw new ProjectValidationError(`country "${input.country}" is not a 2-letter code`);
  }
  if (!LanguageCodeSchema.safeParse(input.language).success) {
    throw new ProjectValidationError(`language "${input.language}" is not a valid code`);
  }
  if (input.data_mode === "measured" && !input.measuredRunnersRegistered) {
    throw new ProjectValidationError(
      "data_mode 'measured' requires registered measured runners, but none are configured",
    );
  }
  if (
    input.monthly_llm_request_cap !== null &&
    (!Number.isInteger(input.monthly_llm_request_cap) || input.monthly_llm_request_cap < 1)
  ) {
    throw new ProjectValidationError("monthly_llm_request_cap must be null or an integer ≥ 1");
  }
  return { brand_id: `brand_${slug}` };
}

export class PipelineOrchestrator {
  private readonly store: PipelineStore;
  private readonly queue: AnalyzeQueue;
  private readonly clock: Clock;
  private readonly llmAdapter: LlmAdapter;
  private readonly fetcher: Pick<UrlFetcher, "fetchPage">;
  private readonly snapshotStore: SnapshotStore;
  private readonly keywordProvider: KeywordVolumeSource;
  private readonly spotCheckRunner: SpotCheckRunner;
  private readonly measuredRunners: readonly MonitoringRunner[];
  private readonly personaVersion: string;
  private readonly gateTimeoutHours: number;
  private readonly log: (event: string) => void;

  constructor(deps: OrchestratorDeps) {
    this.store = deps.store;
    this.queue = deps.queue;
    this.clock = deps.clock;
    this.llmAdapter = deps.llmAdapter;
    this.fetcher = deps.fetcher;
    this.snapshotStore = deps.snapshotStore;
    this.keywordProvider = deps.keywordProvider;
    this.spotCheckRunner = deps.spotCheckRunner;
    this.measuredRunners = deps.measuredRunners ?? [];
    this.personaVersion = deps.personaVersion ?? DEFAULT_PERSONA_VERSION;
    this.gateTimeoutHours = deps.gateTimeoutHours ?? GATE_TIMEOUT_HOURS;
    this.log = deps.log ?? ((_event: string) => {});
  }

  // ── Projects ────────────────────────────────────────────────────────────

  async createProject(input: CreateProjectInput): Promise<PipelineProjectRecord> {
    const dataMode = input.data_mode ?? "llm";
    const cap = input.monthly_llm_request_cap ?? null;
    const { brand_id } = validateProjectInput({
      brand_name: input.brand_name,
      site_url: input.site_url,
      country: input.country ?? "AU",
      language: input.language ?? "en",
      data_mode: dataMode,
      monthly_llm_request_cap: cap,
      measuredRunnersRegistered: this.measuredRunners.length > 0,
    });
    const now = this.clock.isoNow();
    const project: PipelineProjectRecord = {
      project_id: `prj_v2_${randomUUID()}`,
      brand_id,
      brand_name: input.brand_name.trim(),
      site_url: input.site_url,
      trigger: input.trigger,
      country: input.country ?? "AU",
      language: input.language ?? "en",
      gate_config: mergeGateConfig({ 1: false, 2: false, 3: false }, input.gate_config),
      data_mode: dataMode,
      monthly_llm_request_cap: cap,
      cadence: input.cadence ?? "monthly",
      created_at: now,
      updated_at: now,
    };
    await this.store.saveProject(project);
    return project;
  }

  async getProject(projectId: string): Promise<PipelineProjectRecord | null> {
    return this.store.getProject(projectId);
  }

  /**
   * Edits project configuration. A market (country/language) or data-mode
   * change re-baselines: a fresh pipeline run starts (the old baseline stays
   * stored under its own market-scoped plan — markets never mix), and the
   * monitoring schedule re-points at the new plan when it completes.
   */
  async updateProject(projectId: string, patch: UpdateProjectInput): Promise<PipelineProjectRecord> {
    const project = await this.store.getProject(projectId);
    if (project === null) {
      throw new ProjectValidationError(`unknown project ${projectId}`);
    }
    const next: PipelineProjectRecord = {
      ...project,
      brand_name: patch.brand_name ?? project.brand_name,
      site_url: patch.site_url ?? project.site_url,
      country: patch.country ?? project.country,
      language: patch.language ?? project.language,
      gate_config: mergeGateConfig(project.gate_config, patch.gate_config),
      data_mode: patch.data_mode ?? project.data_mode,
      monthly_llm_request_cap:
        patch.monthly_llm_request_cap === undefined
          ? project.monthly_llm_request_cap
          : patch.monthly_llm_request_cap,
      cadence: patch.cadence ?? project.cadence,
    };
    validateProjectInput({
      brand_name: next.brand_name,
      site_url: next.site_url,
      country: next.country,
      language: next.language,
      data_mode: next.data_mode,
      monthly_llm_request_cap: next.monthly_llm_request_cap,
      measuredRunnersRegistered: this.measuredRunners.length > 0,
    });
    next.updated_at = this.clock.isoNow();
    await this.store.saveProject(next);

    if (patch.cadence !== undefined) {
      const schedule = await this.store.getScheduleForProject(projectId);
      if (schedule !== null && schedule.status !== "cancelled") {
        await this.store.saveSchedule({ ...schedule, cadence: patch.cadence, updated_at: next.updated_at });
      }
    }

    const marketChanged =
      (patch.country !== undefined && patch.country !== project.country) ||
      (patch.language !== undefined && patch.language !== project.language);
    const modeChanged = patch.data_mode !== undefined && patch.data_mode !== project.data_mode;
    if (marketChanged || modeChanged) {
      await this.startPipeline(projectId, "site_url");
    }
    return next;
  }

  // ── Install-triggered pipeline ──────────────────────────────────────────

  /** Creates the pipeline in `installed` and hands the run to the queue. */
  async startPipeline(projectId: string, trigger: PipelineTrigger = "site_url"): Promise<PipelineRecord> {
    const project = await this.store.getProject(projectId);
    if (project === null) {
      throw new ProjectValidationError(`unknown project ${projectId}`);
    }
    const now = this.clock.isoNow();
    const pipeline: PipelineRecord = {
      pipeline_id: `pln_${randomUUID()}`,
      project_id: projectId,
      status: "installed",
      status_history: [{ status: "installed", at: now }],
      plan_id: null,
      trigger,
      failure_reason: null,
      failure_detail: null,
      published: false,
      created_at: now,
      updated_at: now,
    };
    await this.store.savePipeline(pipeline);
    const recorded = await this.store.getPipeline(pipeline.pipeline_id);
    if (recorded === null) {
      throw new Error(`pipeline ${pipeline.pipeline_id} disappeared before execution`);
    }
    this.queue.enqueue(() => this.run(recorded.pipeline_id, "installed"));
    return recorded;
  }

  /** The backstop: a typed failure above covers known paths; a bug must still fail the pipeline. */
  private async run(pipelineId: string, entry: PipelineStatus): Promise<void> {
    try {
      await this.advance(pipelineId, entry);
    } catch (error) {
      const failure = orchestrationFailure(error);
      await this.failPipeline(pipelineId, failure.reason, failure.detail);
    }
  }

  /** Dispatches execution from the pipeline's current position. */
  private async advance(pipelineId: string, entry: PipelineStatus): Promise<void> {
    switch (entry) {
      case "installed":
        await this.runStageAPath(pipelineId);
        return;
      case "pending_gate_1":
      case "pending_gate_2":
      case "pending_gate_3":
        // Gates pause the run; decideGate/sweep resumes at the right path.
        return;
      default:
        throw new Error(`no execution path enters at status ${entry}`);
    }
  }

  /** Stage A: crawl → research → modeling → estimating → Gate 1 / selecting. */
  private async runStageAPath(pipelineId: string): Promise<void> {
    const project = await this.loadProject(pipelineId);
    const counted = this.countedAdapter(project);
    const existingGraph = await this.store.getGraph(project.brand_id);
    const outcome = await runStageA(
      {
        siteUrl: project.site_url,
        brand: { brand_id: project.brand_id, name: project.brand_name },
        market: { country: project.country, language: project.language },
        graph_version: existingGraph === null ? 1 : existingGraph.graph_version + 1,
      },
      {
        fetcher: this.fetcher,
        snapshotStore: this.snapshotStore,
        clock: this.clock,
        adapter: counted,
        keywordProvider: this.keywordProvider,
        spotCheckRunner: this.spotCheckRunner,
        onStep: this.stepTranscriber(pipelineId),
      },
    );
    if (!outcome.ok) {
      await this.failPipeline(pipelineId, STAGE_FAILURE_MAP[outcome.reason], outcome.detail);
      return;
    }
    await this.store.saveGraph(outcome.graph);
    if (project.gate_config[1]) {
      await this.openGate(pipelineId, 1);
      return;
    }
    await this.transition(pipelineId, "selecting");
    await this.runStageBPath(pipelineId);
  }

  /** Stage B: selecting → expanding → save plan/prompts → Gate 2 / monitoring. */
  private async runStageBPath(pipelineId: string): Promise<void> {
    const project = await this.loadProject(pipelineId);
    const graph = await this.store.getGraph(project.brand_id);
    if (graph === null) {
      await this.failPipeline(
        pipelineId,
        "internal_error",
        `no marketing graph stored for brand ${project.brand_id} — Stage A must run first`,
      );
      return;
    }
    const counted = this.countedAdapter(project);
    const outcome = await runStageB(
      { adapter: counted, clock: this.clock, onStep: this.stepTranscriber(pipelineId) },
      {
        graph,
        brand: { brand_id: project.brand_id, name: project.brand_name },
        market: { country: project.country, language: project.language },
        plan: {
          data_mode: project.data_mode === "measured" ? "provider_measured" : "llm_simulated",
          cadence: project.cadence,
        },
      },
    );
    if (!outcome.ok) {
      await this.failPipeline(pipelineId, STAGE_FAILURE_MAP[outcome.reason], outcome.detail);
      return;
    }
    await this.store.savePlan(outcome.plan);
    await this.store.savePrompts(project.brand_id, outcome.prompts);
    const pipeline = await this.loadPipeline(pipelineId);
    pipeline.plan_id = outcome.plan.plan_id;
    await this.store.savePipeline(pipeline);

    if (project.gate_config[2]) {
      await this.openGate(pipelineId, 2);
      return;
    }
    await this.transition(pipelineId, "monitoring");
    await this.runMonitoringPath(pipelineId);
  }

  /** Baseline: monitoring → computing → Gate 3 / publish + complete. */
  private async runMonitoringPath(pipelineId: string): Promise<void> {
    const project = await this.loadProject(pipelineId);
    const pipeline = await this.loadPipeline(pipelineId);
    if (pipeline.plan_id === null) {
      await this.failPipeline(pipelineId, "internal_error", "monitoring path entered without a plan");
      return;
    }
    const plan = await this.store.getPlan(pipeline.plan_id);
    if (plan === null) {
      await this.failPipeline(pipelineId, "internal_error", `plan ${pipeline.plan_id} disappeared`);
      return;
    }
    const expectedMode = project.data_mode === "measured" ? "provider_measured" : "llm_simulated";
    if (plan.data_mode !== expectedMode) {
      throw new PlanDataModeMismatchError(expectedMode, plan.data_mode, plan.plan_id);
    }
    const graph = await this.store.getGraph(project.brand_id);
    if (graph === null) {
      await this.failPipeline(pipelineId, "internal_error", "graph disappeared before monitoring");
      return;
    }
    // Gate 2 (approved or off) confirms the prompt set: everything not
    // retired is measured from here on.
    const allPrompts = await this.store.getPrompts(project.brand_id);
    const confirmed = allPrompts
      .filter(
        (prompt) =>
          plan.prompt_ids.includes(prompt.prompt_id) && prompt.status !== "retired",
      )
      .map((prompt) => (prompt.status === "confirmed" ? prompt : { ...prompt, status: "confirmed" as const }));
    await this.store.savePrompts(project.brand_id, [
      ...allPrompts.filter((prompt) => !plan.prompt_ids.includes(prompt.prompt_id)),
      ...confirmed,
    ]);
    if (confirmed.length === 0) {
      await this.failPipeline(pipelineId, "monitoring_failed", "the plan has no runnable prompts");
      return;
    }

    const executed = await executeMonitoring({
      plan,
      prompts: confirmed,
      runners: this.resolveRunners(project),
      aliases: aliasConfigFromGraph(graph, project.brand_name),
      clock: this.clock,
      rounds: plan.baseline_rounds,
    });
    await this.store.saveBaseline({
      plan_id: plan.plan_id,
      project_id: project.project_id,
      graph_id: plan.graph_id,
      graph_version: plan.graph_version,
      country: plan.country,
      language: plan.language,
      data_mode: plan.data_mode,
      run_count: executed.runs.length,
      created_at: this.clock.isoNow(),
    });
    await this.store.saveRuns(plan.plan_id, executed.runs);
    await this.store.saveMetrics(plan.plan_id, [
      ...executed.metrics,
      ...executed.pooledPerPrompt,
      ...executed.pooledPerIntent,
    ]);
    await this.transition(pipelineId, "computing");

    if (project.gate_config[3]) {
      await this.openGate(pipelineId, 3);
      return;
    }
    await this.publishAndComplete(pipelineId);
  }

  /** The publish step: lib + flips + notification → complete + schedule. */
  private async publishAndComplete(pipelineId: string): Promise<void> {
    const project = await this.loadProject(pipelineId);
    const pipeline = await this.loadPipeline(pipelineId);
    if (pipeline.plan_id === null) {
      await this.failPipeline(pipelineId, "internal_error", "publish entered without a plan");
      return;
    }
    const plan = await this.store.getPlan(pipeline.plan_id);
    const graph = await this.store.getGraph(project.brand_id);
    if (plan === null || graph === null) {
      await this.failPipeline(pipelineId, "internal_error", "plan or graph disappeared before publish");
      return;
    }
    const prompts = (await this.store.getPrompts(project.brand_id)).filter(
      (prompt) => plan.prompt_ids.includes(prompt.prompt_id),
    );
    try {
      const existingVersions = new Map(
        (await this.store.listPublishedIntents(project.project_id)).map((entry) => [
          entry.record.intent_id,
          entry.record.intent_version,
        ]),
      );
      const built = buildPublish({
        projectId: project.project_id,
        plan,
        graph,
        prompts,
        pooledPerPrompt: (await this.store.getMetrics(plan.plan_id)).filter(
          (snapshot) => snapshot.prompt_id !== undefined && snapshot.platform === undefined,
        ),
        pooledPerIntent: (await this.store.getMetrics(plan.plan_id)).filter(
          (snapshot) => snapshot.prompt_id === undefined && snapshot.platform === undefined,
        ),
        existingVersions,
        clock: this.clock,
      });
      await this.store.savePublish(built.publish);
      await this.store.savePublishedIntents(
        built.records.map((record) => ({ project_id: project.project_id, record })),
      );
      await this.store.addNotification({
        notification_id: `ntf_${randomUUID()}`,
        project_id: project.project_id,
        kind: "lib_published",
        message: `buyer intent lib published for ${project.brand_name} (${built.records.length} intents, ${plan.data_mode})`,
        created_at: this.clock.isoNow(),
      });
    } catch (error) {
      const failure = orchestrationFailure(error);
      await this.failPipeline(pipelineId, failure.reason === "internal_error" ? "publish_failed" : failure.reason, failure.detail);
      return;
    }

    const completed = await this.loadPipeline(pipelineId);
    completed.published = true;
    await this.transition(pipelineId, "complete", completed);
    await this.ensureSchedule(project, plan);
  }

  /** Gates ────────────────────────────────────────────────────────────────*/

  private async openGate(pipelineId: string, gate: GateNumber): Promise<void> {
    const project = await this.loadProject(pipelineId);
    const now = this.clock.isoNow();
    const timeoutAt = new Date(now);
    timeoutAt.setUTCHours(timeoutAt.getUTCHours() + this.gateTimeoutHours);
    const review: GateReviewRecord = {
      review_id: `rev_${randomUUID()}`,
      project_id: project.project_id,
      pipeline_id: pipelineId,
      gate,
      status: "pending",
      timeout_at: timeoutAt.toISOString(),
      decided_at: null,
      note: null,
      created_at: now,
    };
    await this.store.saveGateReview(review);
    await this.transition(
      pipelineId,
      gate === 1 ? "pending_gate_1" : gate === 2 ? "pending_gate_2" : "pending_gate_3",
    );
    this.log(`gate ${gate} review ${review.review_id} opened for pipeline ${pipelineId}`);
  }

  /**
   * Records a human gate decision and resumes the pipeline: approved → the
   * next stage; rejected → the gate's rework path (Gate 1 → re-crawl,
   * Gate 2 → re-select, Gate 3 → complete unpublished).
   */
  async decideGate(
    reviewId: string,
    decision: Exclude<GateDecision, "auto_approved">,
    note?: string,
  ): Promise<GateReviewRecord> {
    const review = await this.store.getGateReview(reviewId);
    if (review === null) {
      throw new ProjectValidationError(`unknown gate review ${reviewId}`);
    }
    if (review.status !== "pending") {
      throw new ProjectValidationError(`gate review ${reviewId} is already ${review.status}`);
    }
    const now = this.clock.isoNow();
    const decided: GateReviewRecord = {
      ...review,
      status: decision,
      decided_at: now,
      note: note ?? null,
    };
    await this.store.saveGateReview(decided);
    this.queue.enqueue(() => this.resumeAfterGate(review.pipeline_id, review.gate, decision));
    return decided;
  }

  private async resumeAfterGate(
    pipelineId: string,
    gate: GateNumber,
    decision: "approved" | "rejected",
  ): Promise<void> {
    try {
      if (gate === 1) {
        if (decision === "approved") {
          await this.transition(pipelineId, "selecting");
          await this.runStageBPath(pipelineId);
        } else {
          await this.transition(pipelineId, "crawling");
          await this.runStageAPath(pipelineId);
        }
        return;
      }
      if (gate === 2) {
        if (decision === "approved") {
          await this.transition(pipelineId, "monitoring");
          await this.runMonitoringPath(pipelineId);
        } else {
          await this.transition(pipelineId, "selecting");
          await this.runStageBPath(pipelineId);
        }
        return;
      }
      if (decision === "approved") {
        await this.publishAndComplete(pipelineId);
      } else {
        // Rejected at publish: the pipeline completes unpublished and the
        // rejection stays on the review record.
        await this.completeUnpublished(pipelineId);
      }
    } catch (error) {
      const failure = orchestrationFailure(error);
      await this.failPipeline(pipelineId, failure.reason, failure.detail);
    }
  }

  /** Silence past the timeout records auto_approved and resumes. */
  async sweepGateTimeouts(nowIso: string): Promise<number> {
    const pending = await this.store.listGateReviews({ status: "pending" });
    const overdue = pending.filter((review) => review.timeout_at <= nowIso);
    for (const review of overdue) {
      await this.store.saveGateReview({
        ...review,
        status: "auto_approved",
        decided_at: nowIso,
        note: `silence past the ${this.gateTimeoutHours}h timeout — auto-approved`,
      });
      this.queue.enqueue(() => this.resumeAfterGate(review.pipeline_id, review.gate, "approved"));
      this.log(`gate ${review.gate} review ${review.review_id} auto-approved (timeout)`);
    }
    return overdue.length;
  }

  // ── Recurring monitoring scheduler ──────────────────────────────────────

  /**
   * The scheduler tick: sweep gate timeouts, then run every due schedule.
   * Time-driven callers (cron, tests) pass `now`; nothing polls internally.
   */
  async tick(nowIso: string): Promise<TickSummary> {
    const gates_auto_approved = await this.sweepGateTimeouts(nowIso);
    const due = await this.store.listDueSchedules(nowIso);
    const summary: TickSummary = {
      gates_auto_approved,
      cycles_run: 0,
      cycles_paused: 0,
      cycles_failed: 0,
    };
    for (const schedule of due) {
      const result = await this.runMonitoringCycle(schedule, nowIso);
      if (result === "ran") {
        summary.cycles_run += 1;
      } else if (result === "paused") {
        summary.cycles_paused += 1;
      } else {
        summary.cycles_failed += 1;
      }
    }
    return summary;
  }

  /** One recurring monitoring cycle: 1 round, drift check, version bumps. */
  private async runMonitoringCycle(
    schedule: MonitoringScheduleRecord,
    nowIso: string,
  ): Promise<"ran" | "paused" | "failed"> {
    const project = await this.store.getProject(schedule.project_id);
    const plan = await this.store.getPlan(schedule.plan_id);
    if (project === null || plan === null) {
      this.log(`schedule ${schedule.schedule_id} references missing project or plan — skipping`);
      return "failed";
    }
    try {
      await assertWithinUsageCap(this.store, project.project_id, project.monthly_llm_request_cap, nowIso);
    } catch (error) {
      if (error instanceof UsageCapExceeded) {
        await this.pauseSchedule(schedule, error.message, nowIso);
        return "paused";
      }
      throw error;
    }

    const cycle: MonitoringCycleRecord = {
      cycle_id: `cyc_${randomUUID()}`,
      project_id: project.project_id,
      plan_id: plan.plan_id,
      status: "monitoring",
      failure_reason: null,
      failure_detail: null,
      started_at: nowIso,
      finished_at: null,
      drift_events: [],
      bumped_intents: [],
    };
    await this.store.saveCycle(cycle);

    const graph = await this.store.getGraph(project.brand_id);
    if (graph === null) {
      await this.failCycle(cycle, "monitoring_failed", "graph disappeared before the cycle");
      return "failed";
    }
    const prompts = (await this.store.getPrompts(project.brand_id)).filter(
      (prompt) => plan.prompt_ids.includes(prompt.prompt_id) && prompt.status === "confirmed",
    );
    if (prompts.length === 0) {
      await this.failCycle(cycle, "monitoring_failed", "the plan has no confirmed prompts to run");
      return "failed";
    }

    try {
      const executed = await executeMonitoring({
        plan,
        prompts,
        runners: this.resolveRunners(project),
        aliases: aliasConfigFromGraph(graph, project.brand_name),
        clock: this.clock,
        // Recurring cycles also need ≥2 rounds: consensus cannot be computed
        // from a single run (metrics rejects 1-round visibility with
        // MetricsInputError), so one round would fail every cycle.
        rounds: 2,
      });
      await this.store.saveRuns(plan.plan_id, executed.runs);

      // Drift compares the cycle with the stored per-intent visibility
      // (the previous cycle's or the baseline's) BEFORE the metrics rotate.
      const previousPooled = (await this.store.getMetrics(plan.plan_id)).filter(
        (snapshot) => snapshot.prompt_id === undefined && snapshot.platform === undefined,
      );
      const drift = detectDrift(
        visibilityByIntent(previousPooled),
        visibilityByIntent(executed.pooledPerIntent),
      );
      await this.store.saveMetrics(plan.plan_id, [
        ...executed.metrics,
        ...executed.pooledPerPrompt,
        ...executed.pooledPerIntent,
      ]);

      const bumped: MonitoringCycleRecord["bumped_intents"] = [];
      if (drift.length > 0) {
        const published = await this.store.listPublishedIntents(project.project_id);
        for (const event of drift) {
          const entry = published.find(
            (candidate) => candidate.record.intent_id === event.intent_id,
          );
          const pooled = executed.pooledPerIntent.find(
            (snapshot) => snapshot.intent_id === event.intent_id,
          );
          if (entry === undefined || pooled === undefined) {
            continue;
          }
          const record = bumpPublishedRecord(entry.record, pooled, this.clock);
          await this.store.savePublishedIntents([{ project_id: project.project_id, record }]);
          bumped.push({
            intent_id: event.intent_id,
            from_version: entry.record.intent_version,
            to_version: record.intent_version,
          });
        }
      }
      await this.store.saveCycle({
        ...cycle,
        status: "complete",
        finished_at: this.clock.isoNow(),
        drift_events: drift,
        bumped_intents: bumped,
      });
      await this.store.saveSchedule({
        ...schedule,
        next_run_at: nextRunAt(nowIso, schedule.cadence),
        updated_at: this.clock.isoNow(),
      });
      return "ran";
    } catch (error) {
      const failure = orchestrationFailure(error);
      await this.failCycle(cycle, failure.reason, failure.detail);
      if (failure.reason === "usage_cap_reached") {
        await this.pauseSchedule(schedule, failure.detail, this.clock.isoNow());
        return "paused";
      }
      return "failed";
    }
  }

  /** Resume a usage-paused schedule (the customer raised the cap or opted in). */
  async resumeSchedule(projectId: string): Promise<MonitoringScheduleRecord> {
    const schedule = await this.store.getScheduleForProject(projectId);
    if (schedule === null) {
      throw new ProjectValidationError(`no monitoring schedule for project ${projectId}`);
    }
    if (schedule.status !== "paused") {
      throw new ProjectValidationError(`schedule for ${projectId} is ${schedule.status}, not paused`);
    }
    const now = this.clock.isoNow();
    const resumed: MonitoringScheduleRecord = {
      ...schedule,
      status: "active",
      pause_reason: null,
      next_run_at: nextRunAt(now, schedule.cadence),
      updated_at: now,
    };
    await this.store.saveSchedule(resumed);
    await this.store.addNotification({
      notification_id: `ntf_${randomUUID()}`,
      project_id: projectId,
      kind: "schedule_resumed",
      message: `monitoring resumed (${schedule.cadence}); next run ${resumed.next_run_at}`,
      created_at: now,
    });
    return resumed;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private countedAdapter(project: PipelineProjectRecord): LlmAdapter {
    return countingAdapter(
      this.llmAdapter,
      project.project_id,
      this.store,
      this.clock,
      project.monthly_llm_request_cap,
    );
  }

  private resolveRunners(project: PipelineProjectRecord): readonly MonitoringRunner[] {
    const simulated = resolveSimulatedRunners(
      this.countedAdapter(project),
      this.clock,
      this.personaVersion,
    );
    return resolveRunnersForDataMode(
      project.data_mode,
      this.measuredRunners,
      simulated,
    );
  }

  /** Serializes onStep transitions (sync hook, async store writes). */
  private stepTranscriber(pipelineId: string): (step: PipelineStatus) => void {
    let chain: Promise<void> = Promise.resolve();
    return (step: PipelineStatus) => {
      chain = chain.then(async () => {
        await this.transition(pipelineId, step);
      });
    };
  }

  private async ensureSchedule(
    project: PipelineProjectRecord,
    plan: MonitoringPlan,
  ): Promise<void> {
    const now = this.clock.isoNow();
    const existing = await this.store.getScheduleForProject(project.project_id);
    if (existing !== null && existing.status !== "cancelled") {
      await this.store.saveSchedule({
        ...existing,
        plan_id: plan.plan_id,
        cadence: project.cadence,
        next_run_at: nextRunAt(now, project.cadence),
        updated_at: now,
      });
      return;
    }
    const schedule: MonitoringScheduleRecord = {
      schedule_id: `sch_${randomUUID()}`,
      project_id: project.project_id,
      plan_id: plan.plan_id,
      cadence: project.cadence,
      status: "active",
      pause_reason: null,
      next_run_at: nextRunAt(now, project.cadence),
      created_at: now,
      updated_at: now,
    };
    await this.store.saveSchedule(schedule);
    this.log(`monitoring schedule ${schedule.schedule_id} active (${project.cadence})`);
  }

  private async pauseSchedule(
    schedule: MonitoringScheduleRecord,
    reason: string,
    nowIso: string,
  ): Promise<void> {
    await this.store.saveSchedule({
      ...schedule,
      status: "paused",
      pause_reason: reason,
      updated_at: nowIso,
    });
    await this.store.addNotification({
      notification_id: `ntf_${randomUUID()}`,
      project_id: schedule.project_id,
      kind: "usage_cap_reached",
      message: reason,
      created_at: nowIso,
    });
    this.log(`schedule ${schedule.schedule_id} paused: ${reason}`);
  }

  private async failCycle(
    cycle: MonitoringCycleRecord,
    reason: PipelineFailureReason,
    detail: string,
  ): Promise<void> {
    await this.store.saveCycle({
      ...cycle,
      status: "failed",
      failure_reason: reason,
      failure_detail: detail,
      finished_at: this.clock.isoNow(),
    });
  }

  private async completeUnpublished(pipelineId: string): Promise<void> {
    await this.transition(pipelineId, "complete");
  }

  private async transition(
    pipelineId: string,
    status: PipelineStatus,
    base?: PipelineRecord,
  ): Promise<PipelineRecord> {
    const pipeline = base ?? (await this.loadPipeline(pipelineId));
    // Re-announcing the current step is a no-op: stage hooks and explicit
    // transitions can both declare the step without duplicating history.
    if (pipeline.status === status) {
      return pipeline;
    }
    if (!canTransition(pipeline.status, status)) {
      throw new Error(
        `illegal pipeline transition ${pipeline.status} → ${status} for ${pipelineId}`,
      );
    }
    const next: PipelineRecord = {
      ...pipeline,
      status,
      status_history: [...pipeline.status_history, { status, at: this.clock.isoNow() }],
      updated_at: this.clock.isoNow(),
    };
    await this.store.savePipeline(next);
    return next;
  }

  private async failPipeline(
    pipelineId: string,
    reason: PipelineFailureReason,
    detail: string,
  ): Promise<void> {
    const pipeline = await this.loadPipeline(pipelineId);
    if (pipeline.status === "failed") {
      return;
    }
    const next: PipelineRecord = {
      ...pipeline,
      status: "failed",
      status_history: [...pipeline.status_history, { status: "failed", at: this.clock.isoNow() }],
      failure_reason: reason,
      failure_detail: detail,
      updated_at: this.clock.isoNow(),
    };
    await this.store.savePipeline(next);
    this.log(`pipeline ${pipelineId} failed: ${reason} — ${detail}`);
  }

  private async loadPipeline(pipelineId: string): Promise<PipelineRecord> {
    const pipeline = await this.store.getPipeline(pipelineId);
    if (pipeline === null) {
      throw new Error(`pipeline ${pipelineId} disappeared mid-execution`);
    }
    return pipeline;
  }

  private async loadProject(pipelineId: string): Promise<PipelineProjectRecord> {
    const pipeline = await this.loadPipeline(pipelineId);
    const project = await this.store.getProject(pipeline.project_id);
    if (project === null) {
      throw new Error(`project ${pipeline.project_id} disappeared mid-execution`);
    }
    return project;
  }
}
