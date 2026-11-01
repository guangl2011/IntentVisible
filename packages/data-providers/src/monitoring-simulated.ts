/**
 * The lightweight MonitoringRunner default (blueprint Stage C.1): each
 * platform is a calibration persona in the Gemini call — answer style,
 * citation behavior, and brand-recommendation tendencies modeled per
 * platform. Persona versions are pinned per baseline (the same persona
 * version for all rounds in a baseline) and every run records the model_id
 * that produced it. Fixed temperature for reproducibility.
 */

import { DEFAULT_RETRY_OPTIONS, type Clock, type LlmAdapter, type RetryOptions } from "@intentvisible/intent-engine";

import type { Platform } from "@intentvisible/core-schema";
import type { CountryCode, LanguageCode } from "./keywords.js";
import { completeWithRetry } from "./llm.js";
import type { MonitoringRunner, RunResult } from "./monitoring.js";

/** Fixed simulation temperature — reproducibility contract, never configurable. */
export const SIMULATION_TEMPERATURE = 0;

/**
 * Per-platform calibration notes (Monitor Skill §3 platform notes): how
 * each platform answers, cites, and recommends. These are prompt copy —
 * the one Gemini model plays all four platforms, so cross-platform
 * differentiation is approximated, and the export says so.
 */
export const PLATFORM_PERSONA_NOTES: Record<Platform, string> = {
  chatgpt_search:
    "ChatGPT (Search): a conversational assistant answering from its own reasoning, browsing when it judges it necessary. Recommendations read as personal, confident advice in flowing prose; citations are sparse and only when browsing was used.",
  perplexity:
    "Perplexity: a research-assistant answer with inline numbered citations on nearly every sentence, a short direct answer up front, then sourced detail. It leans heavily on cited third-party sources and comparison lists.",
  google_ai_overviews:
    "Google AI Overviews: a compact synthesized summary at the top of a search results page — neutral, encyclopedic tone, draws from ranking pages, cites a handful of representative sources, rarely gives a single strong recommendation.",
  gemini:
    "Gemini: a structured assistant answer with short section headers or bullets, balanced between conversational advice and cited sources, moderately willing to name preferred options.",
};

/** Human-readable platform label for the persona prompt. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  chatgpt_search: "ChatGPT Search",
  perplexity: "Perplexity",
  google_ai_overviews: "Google AI Overviews",
  gemini: "Gemini",
};

export function personaSystemPrompt(platform: Platform, personaVersion: string): string {
  return [
    `You are simulating the AI-search assistant "${PLATFORM_LABELS[platform]}" for a market-research baseline.`,
    PLATFORM_PERSONA_NOTES[platform],
    `Persona version: ${personaVersion}. This persona is pinned for the whole baseline — reproduce its style consistently.`,
    "Answer the user's query exactly as this assistant would, in the query's language and market.",
  ].join("\n");
}

export function simulationUserPrompt(
  prompt: string,
  country: CountryCode,
  language: LanguageCode,
): string {
  return `A user in country ${country} searching in language ${language} asks:\n\n${prompt}`;
}

/**
 * Citations parsed back out of the raw answer — a pure function of the
 * snapshot, so the parsed citation set is reproducible from the stored
 * raw_answer (blueprint run-&-parse integrity).
 */
export function extractCitations(rawAnswer: string): string[] {
  const matches = rawAnswer.matchAll(/https?:\/\/[^\s)>\]"']+/g);
  const citations: string[] = [];
  for (const match of matches) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (!citations.includes(url)) {
      citations.push(url);
    }
  }
  return citations;
}

export interface SimulatedMonitoringRunnerDeps {
  adapter: LlmAdapter;
  clock: Clock;
  platform: Platform;
  /** Pinned per baseline: every runner in one baseline carries the same version. */
  personaVersion: string;
  retry?: Partial<RetryOptions>;
}

export class SimulatedMonitoringRunner implements MonitoringRunner {
  readonly platform: Platform;
  readonly data_mode = "llm_simulated" as const;
  readonly personaVersion: string;
  readonly #adapter: LlmAdapter;
  readonly #clock: Clock;
  readonly #retry: RetryOptions;

  constructor(deps: SimulatedMonitoringRunnerDeps) {
    this.platform = deps.platform;
    this.personaVersion = deps.personaVersion;
    this.#adapter = deps.adapter;
    this.#clock = deps.clock;
    this.#retry = { ...DEFAULT_RETRY_OPTIONS, ...deps.retry };
  }

  async run(prompt: string, country: CountryCode, language: LanguageCode): Promise<RunResult> {
    const response = await completeWithRetry(
      { adapter: this.#adapter, clock: this.#clock, retry: this.#retry },
      {
        system: personaSystemPrompt(this.platform, this.personaVersion),
        user: simulationUserPrompt(prompt, country, language),
        temperature: SIMULATION_TEMPERATURE,
      },
    );
    return {
      raw_answer: response.text,
      citations: extractCitations(response.text),
      model_id: response.model,
      ran_at: this.#clock.isoNow(),
    };
  }
}
