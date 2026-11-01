/**
 * Stage A.1 — the simulated 10-prompt visibility spot check (blueprint:
 * "a simulated visibility spot check (10 prompts, scoring whether the
 * brand is named) (monitoring-simulated)"). The brand-level probe runs
 * before intent topics exist and supplies the gap dimension for the
 * deterministic S/A/B derivation: its pooled Void Rate decides whether
 * the opportunity flag opens (≥25% = gap open).
 *
 * Answers are parsed by the shared metrics parser and scored by the shared
 * formulas — same Visibility and Void Rate definitions as Stage C's
 * pooled metrics, so Stage A numbers stay comparable with later
 * measurements. Stage A adds no scoring rules of its own. The runner is
 * injected structurally: the v1 SimulatedMonitoringRunner satisfies it.
 */

import {
  isHighDifferentiationOpportunity,
  parseAnswer,
  visibilityPct,
  voidRatePct,
  type BrandAliasConfig,
  type ParsedAnswer,
} from "@intentvisible/metrics";
import { type LlmAdapter, type LlmRequest } from "../adapter.js";
import { slugify } from "../slug.js";

/** A monitoring source that answers spot-check prompts with AI-generated text (structural SimulatedMonitoringRunner contract). */
export interface SpotCheckRunner {
  data_mode: "simulated";
  platform: string;
  run(prompts: string[]): Promise<SpotCheckAnswer[]>;
}

/** One spot-check answer: the probe prompt and the assistant's raw answer text. */
export interface SpotCheckAnswer {
  prompt: string;
  answer: string;
}

export interface SpotCheckInput {
  /** Exactly 10 prompts from the entity-resolution pass. */
  prompts: string[];
  brandId: string;
  brandName: string;
  /** Competitor names the pooled void rate must also watch. */
  competitorNames: string[];
}

export interface SpotCheckResult {
  prompts: string[];
  void_rate_pct: number;
  visibility_pct: number;
  /** Void Rate at or above the 25% opportunity threshold (blueprint A.4 gap flag). */
  gap_open: boolean;
  /** Alias configuration the probe used, stored for provenance/replay. */
  aliasConfig: BrandAliasConfig;
  data_mode: "simulated";
  platform: string;
}

const SPOT_CHECK_PROMPTS_REQUIRED = 10;

export class StageASpotCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageASpotCheckError";
  }
}

/**
 * Runs the 10-prompt probe through the runner and scores pooled brand
 * visibility + void rate. Void Rate keeps the canonical pooled definition
 * (answers recommending no monitored competitor); an answer recommending
 * the target brand is still a void when no competitor is recommended —
 * the space is open even when we hold it.
 */
export async function runSpotCheck(
  input: SpotCheckInput,
  runner: SpotCheckRunner,
): Promise<SpotCheckResult> {
  if (input.prompts.length !== SPOT_CHECK_PROMPTS_REQUIRED) {
    throw new StageASpotCheckError(
      `the spot check requires exactly ${SPOT_CHECK_PROMPTS_REQUIRED} prompts; got ${input.prompts.length}`,
    );
  }
  const aliasConfig: BrandAliasConfig = {
    brandId: input.brandId,
    brandAliases: [input.brandName],
    competitors: input.competitorNames.map((name) => ({
      id: slugify(name) || "unnamed",
      aliases: [name],
    })),
  };
  const answers = await runner.run(input.prompts);
  if (answers.length !== input.prompts.length) {
    throw new StageASpotCheckError(
      `the spot-check runner returned ${answers.length} answers for ${input.prompts.length} prompts`,
    );
  }
  const parsed: ParsedAnswer[] = answers.map((answer) => parseAnswer(answer.answer, aliasConfig));
  const competitorIds = new Set(aliasConfig.competitors.map((competitor) => competitor.id));
  const voidAnswers = parsed.filter(
    (answer) => !answer.brands_recommended.some((id) => competitorIds.has(id)),
  ).length;
  const voidRate = voidRatePct(voidAnswers, parsed.length);
  const visibility = visibilityPct(
    parsed.filter((answer) => answer.brand_mentioned).length,
    parsed.length,
  );
  return {
    prompts: [...input.prompts],
    void_rate_pct: voidRate,
    visibility_pct: visibility,
    gap_open: isHighDifferentiationOpportunity(voidRate),
    aliasConfig,
    data_mode: "simulated",
    platform: runner.platform,
  };
}

/**
 * The built-in spot-check runner for the simulated data mode: an LLM
 * answers each probe the way a category buyer's AI assistant would. This
 * is the composition seam — the v1 SimulatedMonitoringRunner already
 * implements the same shape, so callers may inject it instead.
 */
export function createLlmSpotCheckRunner(deps: {
  adapter: LlmAdapter;
  platform?: string;
}): SpotCheckRunner {
  return {
    data_mode: "simulated",
    platform: deps.platform ?? "gemini-simulated",
    async run(prompts: string[]): Promise<SpotCheckAnswer[]> {
      const answers: SpotCheckAnswer[] = [];
      for (const prompt of prompts) {
        const request: LlmRequest = {
          system: [
            "You simulate the AI assistant a category buyer asks. Answer the buyer's prompt the way",
            "well-known assistants answer today: recommend the products/brands you would actually name,",
            "with the reasoning a buyer would accept. Do not mention any brand you would not genuinely",
            "recommend. Answer in plain prose, 2-4 sentences.",
          ].join("\n"),
          user: prompt,
          temperature: 1,
        };
        const response = await deps.adapter.complete(request);
        answers.push({ prompt, answer: response.text });
      }
      return answers;
    },
  };
}
