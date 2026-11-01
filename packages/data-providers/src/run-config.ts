/**
 * The run configuration for a monitoring baseline (blueprint Stage B.3 /
 * C.1): prompts × runs-per-prompt × platforms. Enumeration is a pure
 * function so the baseline's exact LLM call sequence is reproducible and
 * testable without touching a runner.
 */

import { PLATFORMS, type Platform, type PromptRecord } from "@intentvisible/core-schema";
import { MIN_RUNS_PER_PROMPT_NOTE } from "./limits.js";

/** Monitor Skill defaults carried into the pipeline: 3 runs, minimum 2. */
export const DEFAULT_RUNS_PER_PROMPT = 3;
export const MIN_RUNS_PER_PROMPT = 2;

export interface MonitoringRunConfig {
  /** Confirmed Stage B prompts to run. */
  prompts: readonly PromptRecord[];
  /** Runs per prompt per platform. Default 3; below 2 is a config error. */
  runs_per_prompt?: number;
  /** Platforms to run. Default: all four monitored platforms. */
  platforms?: readonly Platform[];
}

export interface MonitoringRunSpec {
  prompt_id: string;
  prompt_text: string;
  platform: Platform;
  /** 1-indexed run number for this (prompt, platform) pair. */
  run_number: number;
}

/** The deterministic baseline call order: prompt order, then platform order, then run number. */
export function enumerateMonitoringRuns(config: MonitoringRunConfig): MonitoringRunSpec[] {
  const runsPerPrompt = config.runs_per_prompt ?? DEFAULT_RUNS_PER_PROMPT;
  if (!Number.isInteger(runsPerPrompt) || runsPerPrompt < MIN_RUNS_PER_PROMPT) {
    throw new RangeError(MIN_RUNS_PER_PROMPT_NOTE);
  }
  const platforms = config.platforms ?? PLATFORMS;
  const specs: MonitoringRunSpec[] = [];
  for (const prompt of config.prompts) {
    for (const platform of platforms) {
      for (let run_number = 1; run_number <= runsPerPrompt; run_number++) {
        specs.push({
          prompt_id: prompt.prompt_id,
          prompt_text: prompt.text,
          platform,
          run_number,
        });
      }
    }
  }
  return specs;
}
