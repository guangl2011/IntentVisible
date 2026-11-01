import type {
  PipelineProject,
  PipelineProjectStart,
  PipelineTrigger,
  UpdatePipelineProjectRequest,
} from "@intentvisible/client";

import { getPipelineClient } from "./client";
import { loadPipeline, type LoadResult } from "./load";

/**
 * Onboarding container logic, extracted from the page so the flow is
 * testable without a DOM (the Shopify loaders pattern). The defaults here
 * are the blueprint's: USA / English market, lightweight LLM data mode,
 * monthly monitoring cadence.
 */

export const ONBOARDING_DEFAULTS = {
  country: "US",
  language: "en",
  data_mode: "llm",
  cadence: "monthly",
} as const;

/** Blank/whitespace URLs never start a pipeline — the field is the only input. */
export function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.trim();
}

export async function startPipeline(
  siteUrl: string,
  trigger: PipelineTrigger,
): Promise<LoadResult<PipelineProjectStart>> {
  const trimmed = normalizeSiteUrl(siteUrl);
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: { kind: "invalid_input", message: "A site URL is required to start the pipeline." },
    };
  }
  return loadPipeline(() =>
    getPipelineClient().createProject({ site_url: trimmed, trigger, ...ONBOARDING_DEFAULTS }),
  );
}

/**
 * Market save: the API re-baselines monitoring when the market changed
 * (markets are never mixed in one baseline); the UI surfaces that
 * consequence before the customer saves.
 */
export async function saveMarket(
  projectId: string,
  market: UpdatePipelineProjectRequest,
): Promise<LoadResult<PipelineProject>> {
  return loadPipeline(() => getPipelineClient().updateProject(projectId, market));
}
