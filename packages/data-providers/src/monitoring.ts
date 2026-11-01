/**
 * The reserved monitoring-runner surface (blueprint Stage C.1 code sample).
 * One runner per platform persona; the simulated default here needs no
 * third-party account, and a measured impl (DataForSEO llm_responses, SERP
 * ai_mode, Visible, native APIs) implements the same interface later with
 * data_mode flipped to "provider_measured".
 */

import type { Platform, RunDataMode } from "@intentvisible/core-schema";
import type { CountryCode, LanguageCode } from "./keywords.js";

export type { Platform } from "@intentvisible/core-schema";

/** One monitoring answer: the immutable snapshot of a single run. */
export interface RunResult {
  /** Raw answer text — snapshotted by the caller before parsing. */
  raw_answer: string;
  /** Cited domains/URLs (simulated: the plausible domain set in the answer). */
  citations: string[];
  /** Provider/model that produced the answer, e.g. "gemini-2.5-pro". */
  model_id: string;
  ran_at: string;
}

export interface MonitoringRunner {
  /** Platform persona this runner plays. One instance = one platform. */
  readonly platform: Platform;
  /** Fixed at construction — a runner never changes its own mode. */
  readonly data_mode: RunDataMode;
  /** Run one prompt once; the raw answer is snapshotted before parsing. */
  run(prompt: string, country: CountryCode, language: LanguageCode): Promise<RunResult>;
}
