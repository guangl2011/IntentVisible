/**
 * Stage C monitoring execution (blueprint C.1): run a plan's deterministic
 * spec list against per-platform runners, snapshot every answer as an
 * immutable MonitoringRun, and compute validated metrics. The mode-integrity
 * guard lives here: every runner must agree with the plan's data mode before
 * the first call is made, and each run is re-checked — a mixed-mode plan is
 * rejected with a typed error, never silently pooled.
 */

import { createHash } from "node:crypto";

import {
  MetricsSnapshotSchema,
  MonitoringRunSchema,
  type MetricsSnapshot,
  type MonitoringRun,
  type PromptRecord,
} from "@intentvisible/core-schema";
import {
  computeMetrics,
  computePooledMetrics,
  type ComputeMetricsOptions,
} from "@intentvisible/metrics";
import {
  enumerateMonitoringRuns,
  type MonitoringRunner,
} from "@intentvisible/data-providers";
import type { Clock, MonitoringPlan } from "@intentvisible/intent-engine";
import type { BrandAliasConfig } from "@intentvisible/metrics";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** The parser lexicon for a plan: the monitored brand plus every graph competitor. */
export function aliasConfigFromGraph(
  graph: { brand_id: string; competitors: ReadonlyArray<{ brand_id: string; name: string }> },
  brandName: string,
): BrandAliasConfig {
  return {
    brandId: graph.brand_id,
    brandAliases: [brandName],
    competitors: graph.competitors.map((competitor) => ({
      id: competitor.brand_id,
      aliases: [competitor.name],
    })),
  };
}

export class RunnerMissingError extends Error {
  readonly reason = "monitoring_failed" as const;

  constructor(platform: string) {
    super(`no monitoring runner is registered for platform ${platform}`);
    this.name = "RunnerMissingError";
  }
}

/** The typed mixed-mode rejection: a runner whose mode disagrees with the plan. */
export class PlanDataModeMismatchError extends Error {
  readonly reason = "data_mode_mismatch" as const;

  constructor(planMode: string, runnerMode: string, platform: string) {
    super(
      `monitoring plan requires data_mode ${planMode} but the ${platform} runner reports ${runnerMode} — mixed-mode plans are rejected, never pooled`,
    );
    this.name = "PlanDataModeMismatchError";
  }
}

export interface ExecuteMonitoringInput {
  plan: MonitoringPlan;
  prompts: readonly PromptRecord[];
  runners: readonly MonitoringRunner[];
  /** Parser lexicon (brand + competitor aliases) built from the plan's graph. */
  aliases: BrandAliasConfig;
  clock: Clock;
  /** Baseline rounds (default 3); a recurring cycle runs exactly 1. */
  rounds: number;
}

export interface ExecutedBaseline {
  runs: MonitoringRun[];
  /** Per prompt × platform snapshots for every intent in the plan. */
  metrics: MetricsSnapshot[];
  /** Pooled per-prompt snapshots (prompt_id set, platform absent) — the lib join key. */
  pooledPerPrompt: MetricsSnapshot[];
  /** Per-intent pooled snapshots (neither prompt nor platform) — drift + records input. */
  pooledPerIntent: MetricsSnapshot[];
}

/** Builds one validated MonitoringRun from a runner answer. */
function toMonitoringRun(
  plan: MonitoringPlan,
  promptId: string,
  promptText: string,
  platform: string,
  round: number,
  runNumber: number,
  answer: { raw_answer: string; citations: string[]; model_id: string; ran_at: string },
): MonitoringRun {
  return MonitoringRunSchema.parse({
    schema_version: "2.0.0",
    run_id: `run_${sha256(`${plan.plan_id}|${promptId}|${platform}|${round}|${runNumber}`).slice(0, 24)}`,
    prompt_id: promptId,
    platform,
    round,
    raw_answer: answer.raw_answer,
    raw_answer_content_hash: sha256(answer.raw_answer),
    citations: answer.citations,
    model_id: answer.model_id,
    country: plan.country,
    language: plan.language,
    ran_at: answer.ran_at,
    data_mode: plan.data_mode,
    provenance: { source: answer.model_id, retrieved_at: answer.ran_at },
  });
}

/** Mode guard up front: every platform the plan enumerates needs a same-mode runner. */
function resolveRunner(
  runners: readonly MonitoringRunner[],
  platform: string,
  planMode: MonitoringPlan["data_mode"],
): MonitoringRunner {
  const runner = runners.find((candidate) => candidate.platform === platform);
  if (runner === undefined) {
    throw new RunnerMissingError(platform);
  }
  if (runner.data_mode !== planMode) {
    throw new PlanDataModeMismatchError(planMode, runner.data_mode, platform);
  }
  return runner;
}

/**
 * Executes a monitoring baseline or cycle. The whole call sequence is the
 * plan's enumeration — deterministic order, every answer snapshotted before
 * parsing. A runner failure mid-baseline fails the run loudly (typed error
 * propagates); completed runs are returned via the error's payload-free
 * contract and the plan can be re-run (runs accumulate by run_id).
 */
export async function executeMonitoring(
  input: ExecuteMonitoringInput,
): Promise<ExecutedBaseline> {
  const { plan, prompts, runners } = input;
  if (!Number.isInteger(input.rounds) || input.rounds < 1) {
    throw new RangeError(`rounds must be a positive integer, got ${input.rounds}`);
  }
  const specs = enumerateMonitoringRuns({
    prompts,
    runs_per_prompt: plan.runs_per_prompt,
    platforms: plan.platforms,
  });

  // Validate the full mode matrix before spending the first LLM call.
  for (const platform of plan.platforms) {
    resolveRunner(runners, platform, plan.data_mode);
  }

  const runs: MonitoringRun[] = [];
  for (let round = 1; round <= input.rounds; round++) {
    for (const spec of specs) {
      const runner = resolveRunner(runners, spec.platform, plan.data_mode);
      const answer = await runner.run(spec.prompt_text, plan.country, plan.language);
      runs.push(
        toMonitoringRun(
          plan,
          spec.prompt_id,
          spec.prompt_text,
          spec.platform,
          round,
          spec.run_number,
          answer,
        ),
      );
    }
  }

  const promptsById = new Map(prompts.map((prompt) => [prompt.prompt_id, prompt]));
  const metricsOptions = (intentId: string): ComputeMetricsOptions => ({
    brandId: plan.brand_id,
    intentId,
    aliases: input.aliases,
  });

  // Group runs by their prompt's intent, then compute per intent.
  const runsByIntent = new Map<string, MonitoringRun[]>();
  for (const run of runs) {
    const prompt = promptsById.get(run.prompt_id);
    if (prompt === undefined) {
      throw new Error(
        `run ${run.run_id} references prompt ${run.prompt_id} which is not in the plan's prompt set`,
      );
    }
    const bucket = runsByIntent.get(prompt.intent_id) ?? [];
    bucket.push(run);
    runsByIntent.set(prompt.intent_id, bucket);
  }

  const metrics: MetricsSnapshot[] = [];
  const pooledPerPrompt: MetricsSnapshot[] = [];
  const pooledPerIntent: MetricsSnapshot[] = [];
  for (const [intentId, intentRuns] of [...runsByIntent.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    metrics.push(...computeMetrics(intentRuns, metricsOptions(intentId)));
    pooledPerIntent.push(
      MetricsSnapshotSchema.parse(computePooledMetrics(intentRuns, metricsOptions(intentId))),
    );
    // Pooled per prompt: the lib join key (prompt_id set, platform absent).
    const runsByPrompt = new Map<string, MonitoringRun[]>();
    for (const run of intentRuns) {
      const bucket = runsByPrompt.get(run.prompt_id) ?? [];
      bucket.push(run);
      runsByPrompt.set(run.prompt_id, bucket);
    }
    const sortedPrompts = [...runsByPrompt.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [promptId, promptRuns] of sortedPrompts) {
      pooledPerPrompt.push(
        MetricsSnapshotSchema.parse(
          computePooledMetrics(promptRuns, { ...metricsOptions(intentId), promptId }),
        ),
      );
    }
  }
  return { runs, metrics, pooledPerPrompt, pooledPerIntent };
}
