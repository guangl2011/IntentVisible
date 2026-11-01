/**
 * Stage B.3 — the baseline monitoring plan (blueprint "B.3 — Monitoring
 * setup (baseline)"). The plan is written with the prompts: which
 * platforms to run (default all four), how many runs per prompt per
 * platform (default 3, minimum 2 per Monitor Skill), how many consecutive
 * baseline rounds precede the lib (3, to denoise run-to-run drift), and
 * the iteration cadence (monthly default, weekly opt-in). The plan
 * records the data mode at creation time — llm_simulated by default — so
 * metrics produced under a future measured mode never mix with simulated
 * baselines; a mode transition creates a new plan, never a splice.
 *
 * The plan record lives in the engine (not core-schema) because it is
 * Stage B's product, per the blueprint's packages table; Stage C consumes
 * it through the runner's enumerateMonitoringRuns.
 */

import { z } from "zod";

import {
  BrandIdSchema,
  CountryCodeSchema,
  GraphIdSchema,
  IsoDateTimeSchema,
  LanguageCodeSchema,
  PLATFORMS,
  ProvenanceSchema,
  PromptIdSchema,
  RUN_DATA_MODES,
  SCHEMA_VERSION_V2,
  SchemaVersionV2Schema,
  patternSchema,
  type MarketingGraph,
  type Platform,
  type PromptRecord,
  type RunDataMode,
} from "@intentvisible/core-schema";

import { freshStableId } from "../stage-a/graph.js";
import { slugify } from "../slug.js";

/**
 * The runs-per-prompt contract of data-providers' run config (min 2, default 3),
 * declared structurally: data-providers depends on this package, so importing
 * from it would form a workspace cycle (same pattern as stage-a/demand.ts).
 */
export const MIN_RUNS_PER_PROMPT = 2;
export const DEFAULT_RUNS_PER_PROMPT = 3;

export const PLAN_ID_PATTERN = "^plan_[a-z0-9_]{1,100}$";
export const PlanIdSchema = patternSchema(PLAN_ID_PATTERN, "plan_id must look like plan_<slug>");

/** Iteration cadences (blueprint B.3): monthly default; weekly is the opt-in that also unlocks Stage A's deeper crawl cap. */
export const MONITORING_CADENCES = ["monthly", "weekly"] as const;
export type MonitoringCadence = (typeof MONITORING_CADENCES)[number];

export const DEFAULT_BASELINE_ROUNDS = 3;
export const DEFAULT_CADENCE: MonitoringCadence = "monthly";
export const DEFAULT_PLAN_DATA_MODE: RunDataMode = "llm_simulated";

/** Structural cap on runs per prompt (the Monitor Skill range is 2–3; loose cap so config stays valid). */
const MAX_RUNS_PER_PROMPT = 10;
/** Structural cap on baseline rounds (the standard baseline is 3). */
const MAX_BASELINE_ROUNDS = 10;

export const MonitoringPlanSchema = z.strictObject({
  schema_version: SchemaVersionV2Schema,
  plan_id: PlanIdSchema,
  brand_id: BrandIdSchema,
  /** The graph the selection and prompts came from — the plan's provenance anchor. */
  graph_id: GraphIdSchema,
  graph_version: z.number().int().min(1),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(PLATFORMS.length),
  runs_per_prompt: z.number().int().min(MIN_RUNS_PER_PROMPT).max(MAX_RUNS_PER_PROMPT),
  baseline_rounds: z.number().int().min(1).max(MAX_BASELINE_ROUNDS),
  cadence: z.enum(MONITORING_CADENCES),
  /** The confirmed-at-Gate-2 prompts the baseline runs (drafts at plan time). */
  prompt_ids: z.array(PromptIdSchema).min(1).max(1000),
  country: CountryCodeSchema,
  language: LanguageCodeSchema,
  /** Recorded at creation — one plan is one mode; mode transitions create a new plan. */
  data_mode: z.enum(RUN_DATA_MODES),
  created_at: IsoDateTimeSchema,
  provenance: ProvenanceSchema,
});

export type MonitoringPlan = z.output<typeof MonitoringPlanSchema>;

export interface PlanOptions {
  /** Defaults to all four monitored platforms. */
  platforms?: readonly Platform[];
  /** Runs per prompt per platform; defaults to 3, minimum 2. */
  runs_per_prompt?: number;
  /** Consecutive baseline rounds before the lib is generated; defaults to 3. */
  baseline_rounds?: number;
  /** Iteration cadence; defaults to monthly. */
  cadence?: MonitoringCadence;
  /** Measurement mode at creation; defaults to llm_simulated. */
  data_mode?: RunDataMode;
}

export interface MonitoringPlanInput {
  graph: MarketingGraph;
  /** The expanded prompt records the baseline will run. */
  prompts: readonly PromptRecord[];
  /** Creation timestamp (ISO) — from the clock, never improvised. */
  createdAt: string;
  /** Provenance source for the plan — the expansion model that produced the prompts. */
  source: string;
  options?: PlanOptions;
}

/**
 * Builds the baseline monitoring plan with the blueprint's defaults.
 * Deterministic: the plan_id derives from the graph id and version, so
 * the same graph re-plans to the same id (the API can upsert on it).
 * Throws (ZodError/RangeError) when the options violate the plan
 * contract — e.g. fewer than two runs per prompt — which runStageB maps
 * to its typed plan_invalid failure.
 */
export function buildMonitoringPlan(input: MonitoringPlanInput): MonitoringPlan {
  const options = input.options ?? {};
  const requestedPlatforms = options.platforms ?? PLATFORMS;
  const platformSet = new Set(requestedPlatforms);
  if (platformSet.size !== requestedPlatforms.length) {
    throw new RangeError("platforms must not contain duplicates");
  }
  const platforms = PLATFORMS.filter((platform) => platformSet.has(platform));
  if (platforms.length !== requestedPlatforms.length) {
    const unknown = requestedPlatforms.filter((platform) => !PLATFORMS.includes(platform));
    throw new RangeError(`unknown platforms: ${unknown.join(", ")} (monitored set: ${PLATFORMS.join(", ")})`);
  }

  // The market is part of the plan's identity (blueprint Iteration: a market
  // change re-baselines — two markets can never share a plan_id, so their
  // runs can never pool into one baseline).
  const country = input.prompts[0]?.country;
  const language = input.prompts[0]?.language;
  const planIdMaterial = slugify(
    `${input.graph.graph_id}_v${input.graph.graph_version}_${country ?? "unknown"}_${language ?? "unknown"}`,
  ).slice(0, 80);
  const plan = MonitoringPlanSchema.parse({
    schema_version: SCHEMA_VERSION_V2,
    plan_id: freshStableId("plan", planIdMaterial, new Set()),
    brand_id: input.graph.brand_id,
    graph_id: input.graph.graph_id,
    graph_version: input.graph.graph_version,
    platforms,
    runs_per_prompt: options.runs_per_prompt ?? DEFAULT_RUNS_PER_PROMPT,
    baseline_rounds: options.baseline_rounds ?? DEFAULT_BASELINE_ROUNDS,
    cadence: options.cadence ?? DEFAULT_CADENCE,
    prompt_ids: input.prompts.map((prompt) => prompt.prompt_id),
    country,
    language,
    data_mode: options.data_mode ?? DEFAULT_PLAN_DATA_MODE,
    created_at: input.createdAt,
    provenance: { source: input.source, retrieved_at: input.createdAt },
  });
  return plan;
}
