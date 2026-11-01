/**
 * Stage B — from Marketing Graph to a runnable monitoring plan
 * (blueprint section "Stage B — the prompt engine"). Orchestrates, in
 * order:
 *
 *   B.1  deterministic intent selection (Monitor Skill rule, batch 8,
 *        documented tie-breaks) plus optional customer replacements
 *   B.2  per-intent persona-voiced prompt expansion (5–7 prompts each)
 *        through one LLM pass, validated against the graph's claim
 *        corpus, then market-partitioned near-duplicate collapse
 *   B.3  the baseline monitoring plan written with the prompts
 *
 * The graph (Stage A's product) is the input; the expanded PromptRecords
 * and the MonitoringPlan are the output. Every failure is typed
 * (StageBFailure) so callers branch on reason, not message text. All
 * randomness-free: the same graph plus the same model outputs yields the
 * same plan.
 */

import type { Clock } from "../clock.js";
import type { LlmAdapter } from "../adapter.js";
import { DEFAULT_RETRY_OPTIONS, type RetryOptions } from "../generate.js";
import { completeAndParse, StageAFailure } from "../stage-a/llm.js";
import { collectGraphClaims } from "./claims.js";
import {
  buildExpansionUserPrompt,
  buildPromptRecords,
  dedupPrompts,
  expansionSystemPrompt,
  MIN_PROMPTS_PER_INTENT,
  parseExpansion,
  personaScenarioPairs,
  type ExpandedPromptDraft,
  type StageBDropEvent,
} from "./expand.js";
import {
  buildMonitoringPlan,
  type MonitoringPlan,
  type PlanOptions,
} from "./plan.js";
import {
  applySelectionOverrides,
  selectIntents,
  type IntentSelection,
  type SelectionReplacement,
} from "./select.js";
import type { MarketingGraph, PromptRecord } from "@intentvisible/core-schema";

/** Why Stage B failed (blueprint failure taxonomy, Stage B rows). */
export const STAGE_B_FAILURE_REASONS = [
  "selection_empty",
  "no_scenarios",
  "llm_unavailable",
  "llm_invalid_output",
  "expansion_underflow",
  "plan_invalid",
] as const;
export type StageBFailureReason = (typeof STAGE_B_FAILURE_REASONS)[number];

export class StageBFailure extends Error {
  readonly reason: StageBFailureReason;
  readonly detail: string;

  constructor(reason: StageBFailureReason, detail: string) {
    super(`${reason}: ${detail}`);
    this.name = "StageBFailure";
    this.reason = reason;
    this.detail = detail;
  }
}

/** Where the prompts target — project onboarding config (blueprint defaults: USA, English). */
export interface StageBMarket {
  country: string;
  language: string;
}

export const DEFAULT_STAGE_B_MARKET: StageBMarket = { country: "US", language: "en" };

export interface StageBInput {
  /** The validated Marketing Graph (Stage A's product). */
  graph: MarketingGraph;
  /** The brand under analysis — must be the graph's subject. */
  brand: { brand_id: string; name: string };
  market?: StageBMarket;
  /** Batch size 1–20 (default 8). */
  batch_size?: number;
  /** Customer hand-replacements, validated against the selection. */
  overrides?: readonly SelectionReplacement[];
  /** Plan overrides; defaults per blueprint B.3. */
  plan?: PlanOptions;
}

export interface StageBDeps {
  adapter: LlmAdapter;
  clock: Clock;
  retry?: Partial<RetryOptions>;
}

/** One collapsed near-duplicate, joined to the canonical's minted prompt id (QA log only). */
export interface CollapsedPrompt {
  canonical_prompt_id: string;
  canonical_text: string;
  variant_text: string;
  variant_intent_id: string;
}

/** Everything the Gate-2 review sees, alongside the artifacts. */
export interface StageBReport {
  selection: IntentSelection;
  prompts: PromptRecord[];
  /** Canonical prompt count per selected intent, in batch order. */
  prompts_per_intent: Array<{ intent_id: string; count: number }>;
  collapsed: CollapsedPrompt[];
  /** Typed drop events across all intents (prompts removed by validation). */
  dropped: StageBDropEvent[];
  plan: MonitoringPlan;
}

export type StageBOutcome =
  | { ok: true; prompts: PromptRecord[]; plan: MonitoringPlan; report: StageBReport }
  | { ok: false; reason: StageBFailureReason; detail: string; dropped: StageBDropEvent[] };

/**
 * Runs Stage B end to end. Not exported to the API yet (Stage C wires
 * the endpoint); called directly by tests and the future orchestrator.
 */
export async function runStageB(deps: StageBDeps, input: StageBInput): Promise<StageBOutcome> {
  const { graph } = input;
  if (input.brand.brand_id !== graph.brand_id) {
    throw new TypeError(
      `brand mismatch: brand ${input.brand.brand_id} is not the graph subject ${graph.brand_id}`,
    );
  }
  const market = input.market ?? DEFAULT_STAGE_B_MARKET;
  const dropped: StageBDropEvent[] = [];

  // B.1 — deterministic selection (+ optional customer replacements).
  let selection = selectIntents(graph, { batch_size: input.batch_size });
  if (input.overrides !== undefined && input.overrides.length > 0) {
    selection = applySelectionOverrides(selection, graph, input.overrides);
  }
  const batch = selection.batch;
  if (batch.length === 0) {
    return {
      ok: false,
      reason: "selection_empty",
      detail: "no intents qualified for the monitoring batch — add demand or gap signals and re-model",
      dropped,
    };
  }

  // B.2 — the grounding context every expansion pass shares.
  const corpus = collectGraphClaims(graph);
  const voices = personaScenarioPairs(graph);
  if (voices.length === 0) {
    return {
      ok: false,
      reason: "no_scenarios",
      detail: "the graph has no persona×scenario pair — Stage A modeling produced no usable voices",
      dropped,
    };
  }
  const competitorIds = graph.competitors.map((competitor) => competitor.brand_id);
  const competitorNames = graph.competitors.map((competitor) => ({
    name: competitor.name,
    relation: competitor.relation,
  }));
  /** Each intent's primary demand phrase, from its graph topic's volume dimension. */
  const primaryKeywordByIntentId = new Map(
    graph.intent_topics.map((topic) => [topic.intent_id, topic.volume.keyword]),
  );

  const retry: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...deps.retry };
  const drafts: ExpandedPromptDraft[] = [];
  let expansionModel = "unknown";

  for (const intent of batch) {
    const request = {
      system: expansionSystemPrompt(),
      user: buildExpansionUserPrompt({
        brandName: input.brand.name,
        brandId: input.brand.brand_id,
        country: market.country,
        language: market.language,
        intent,
        primaryKeyword: primaryKeywordByIntentId.get(intent.intent_id) ?? intent.intent_name,
        competitorNames,
        voices,
        corpus,
      }),
      temperature: 0,
    };
    try {
      const { response, parsed } = await completeAndParse(
        { adapter: deps.adapter, clock: deps.clock, retry },
        request,
        (text) =>
          parseExpansion(text, {
            corpus,
            voices,
            intent,
            brandId: input.brand.brand_id,
            country: market.country,
            language: market.language,
            competitorIds,
          }),
      );
      expansionModel = response.model;
      drafts.push(...parsed.drafts);
      dropped.push(...parsed.dropped);
    } catch (error) {
      if (error instanceof StageAFailure) {
        return {
          ok: false,
          reason: error.reason,
          detail: `expansion for intent "${intent.intent_name}" (${intent.intent_id}): ${error.detail}`,
          dropped,
        };
      }
      throw error;
    }
  }

  // Near-duplicate collapse across the whole batch, then the per-intent
  // bound check — the blueprint's 5–7 guarantee is on what survives.
  const dedup = dedupPrompts(drafts);
  const promptsPerIntent = new Map<string, number>();
  for (const draft of dedup.canonical) {
    promptsPerIntent.set(draft.intent.intent_id, (promptsPerIntent.get(draft.intent.intent_id) ?? 0) + 1);
  }
  const underflow = batch.filter(
    (intent) => (promptsPerIntent.get(intent.intent_id) ?? 0) < MIN_PROMPTS_PER_INTENT,
  );
  if (underflow.length > 0) {
    const counts = underflow
      .map((intent) => `"${intent.intent_name}" (${promptsPerIntent.get(intent.intent_id) ?? 0})`)
      .join(", ");
    return {
      ok: false,
      reason: "expansion_underflow",
      detail: `after dedup, these intents kept fewer than ${MIN_PROMPTS_PER_INTENT} distinct prompts: ${counts} — widen the persona coverage or lower similarity collapse`,
      dropped,
    };
  }

  const generatedAt = deps.clock.isoNow();
  const prompts = buildPromptRecords(dedup.canonical, { model: expansionModel, generatedAt });

  const promptIdByDraft = new Map<ExpandedPromptDraft, string>();
  dedup.canonical.forEach((draft, index) => {
    const record = prompts[index];
    if (record !== undefined) {
      promptIdByDraft.set(draft, record.prompt_id);
    }
  });
  const collapsed = dedup.collapsed.flatMap((collapse) => {
    const canonicalPromptId = promptIdByDraft.get(collapse.canonical);
    if (canonicalPromptId === undefined) {
      return [];
    }
    return collapse.variants.map((variant) => ({
      canonical_prompt_id: canonicalPromptId,
      canonical_text: collapse.canonical.text,
      variant_text: variant.text,
      variant_intent_id: variant.intent_id,
    }));
  });

  // B.3 — the baseline plan, written with the prompts.
  let plan: MonitoringPlan;
  try {
    plan = buildMonitoringPlan({
      graph,
      prompts,
      createdAt: generatedAt,
      source: expansionModel,
      options: input.plan,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: "plan_invalid",
      detail: `the monitoring plan rejected its configuration: ${detail}`,
      dropped,
    };
  }

  return {
    ok: true,
    prompts,
    plan,
    report: {
      selection,
      prompts,
      prompts_per_intent: batch.map((intent) => ({
        intent_id: intent.intent_id,
        count: promptsPerIntent.get(intent.intent_id) ?? 0,
      })),
      collapsed,
      dropped,
      plan,
    },
  };
}
