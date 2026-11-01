/**
 * buildLibExport — apply the Export Spec v2 rules mechanically to stored
 * pipeline records (blueprint Stage C.3): ≥30% floor, Revenue/Market split
 * at 50%, group by intent, deterministic sorts, competitors copied
 * unranked from the graph, data mode + provenance carried end to end.
 * Pure function over validated inputs — no LLM, no network, no I/O.
 */

import type { DataMode, DemandTier, MetricsSnapshot } from "@intentvisible/core-schema";
import { RUN_DATA_MODES, type RunDataMode } from "@intentvisible/core-schema";

import { LibInputError, MixedDataModeError, PooledSnapshotMissingError } from "./errors.js";
import {
  REVENUE_SPLIT_THRESHOLD_PCT,
  VISIBILITY_FLOOR_PCT,
  type BuyerIntentLib,
  type ExcludedPromptCounts,
  type LibExportInput,
  type LibIntent,
  type LibPrompt,
} from "./types.js";

const DEMAND_TIER_RANK: Record<DemandTier, number> = { high: 3, medium: 2, low: 1 };

/** Format a visibility number the way the spec displays it: `84%`, `83.5%`. */
export function formatVisibilityPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${body}%`;
}

/** ISO date (YYYY-MM-DD) portion of an ISO timestamp — the spec's Date field. */
export function formatDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

/**
 * The pooled per-prompt snapshot (prompt_id set, platform absent) — the
 * join key between prompts and stored metrics. Returns "per-platform-only"
 * when only per-platform snapshots exist so the caller can be told to pool
 * them (computePooledMetrics) instead of the renderer recomputing.
 */
export function pooledSnapshotFor(
  promptId: string,
  metrics: ReadonlyArray<MetricsSnapshot>,
): MetricsSnapshot | "per-platform-only" | undefined {
  let sawPerPlatform = false;
  let pooled: MetricsSnapshot | undefined;
  for (const snapshot of metrics) {
    if (snapshot.prompt_id !== promptId) {
      continue;
    }
    if (snapshot.platform !== undefined) {
      sawPerPlatform = true;
      continue;
    }
    if (pooled === undefined || (snapshot.generated_at ?? "") > (pooled.generated_at ?? "")) {
      pooled = snapshot;
    }
  }
  if (pooled !== undefined) {
    return pooled;
  }
  return sawPerPlatform ? "per-platform-only" : undefined;
}

/** Type guard: `llm_estimated` can never describe a run or a metric snapshot. */
function isRunDataMode(mode: DataMode): mode is RunDataMode {
  return (RUN_DATA_MODES as readonly DataMode[]).includes(mode);
}

/**
 * Build the structured lib. Rejects malformed input, dangling intent
 * references, mixed data modes, and prompts whose pooled snapshot is
 * missing — a renderer that guesses is a renderer that fabricates.
 */
export function buildLibExport(input: LibExportInput): BuyerIntentLib {
  const { graph, prompts, metrics } = input;

  // One export is one data mode: prompts and metrics must all agree, and
  // the mode must be a measurement-side mode (`llm_estimated` can never
  // describe a run or a metric — enums-v2 RUN_DATA_MODES).
  const modes = [...new Set([...prompts, ...metrics].map((record) => record.data_mode))];
  if (modes.length > 1) {
    throw new MixedDataModeError(modes);
  }
  const dataMode = modes[0];
  if (dataMode === undefined || !isRunDataMode(dataMode)) {
    throw new LibInputError(
      `lib inputs carry no measurement-side data mode (expected one of ${RUN_DATA_MODES.join(", ")}); found: ${String(dataMode)}`,
    );
  }

  const topicsById = new Map(graph.intent_topics.map((topic) => [topic.intent_id, topic]));
  const personasById = new Map(graph.personas.map((persona) => [persona.persona_id, persona]));
  const scenariosById = new Map(graph.scenarios.map((scenario) => [scenario.scenario_id, scenario]));
  const intentRecordsById = new Map(
    (input.intentRecords ?? []).map((record) => [record.intent_id, record]),
  );
  const competitorNameById = new Map(
    graph.competitors.map((competitor) => [competitor.brand_id, competitor.name]),
  );

  const excluded: ExcludedPromptCounts = { belowVisibilityFloor: 0, noisyBaseline: 0 };
  const promptsByIntent = new Map<string, LibPrompt[]>();
  const addPrompt = (intentId: string, prompt: LibPrompt): void => {
    const bucket = promptsByIntent.get(intentId);
    if (bucket === undefined) {
      promptsByIntent.set(intentId, [prompt]);
    } else {
      bucket.push(prompt);
    }
  };

  for (const prompt of prompts) {
    if (prompt.status !== "confirmed") {
      continue; // drafts and retired prompts are tracked in the graph, not exported
    }
    if (!topicsById.has(prompt.intent_id)) {
      throw new LibInputError(
        `prompt ${prompt.prompt_id} references intent_id ${prompt.intent_id} which is not in the graph`,
      );
    }
    const snapshot = pooledSnapshotFor(prompt.prompt_id, metrics);
    if (snapshot === undefined) {
      continue; // never measured — nothing to publish
    }
    if (snapshot === "per-platform-only") {
      throw new PooledSnapshotMissingError(prompt.prompt_id);
    }
    if (snapshot.consensus === "noisy") {
      excluded.noisyBaseline += 1;
      continue; // a noisy prompt's number is not published (blueprint Stage C.2)
    }
    if (snapshot.visibility_pct < VISIBILITY_FLOOR_PCT) {
      excluded.belowVisibilityFloor += 1;
      continue; // Output Rule 10: below the floor stays tracked-but-unpublished
    }

    const intentRecord = intentRecordsById.get(prompt.intent_id);
    const persona = personasById.get(prompt.persona_id);
    const scenario = scenariosById.get(prompt.scenario_id);
    addPrompt(prompt.intent_id, {
      promptId: prompt.prompt_id,
      text: prompt.text,
      visibilityPct: snapshot.visibility_pct,
      buyerStage: prompt.buyer_stage,
      intentCategory: prompt.intent_category,
      painPoint: intentRecord?.pain_point ?? null,
      personaName: intentRecord?.persona ?? persona?.archetype ?? null,
      scenarioContext: scenario?.description.text ?? null,
      language: prompt.language,
      country: prompt.country,
      brandId: prompt.brand_id,
      competitorNames: prompt.competitors.flatMap((id) => {
        const name = competitorNameById.get(id);
        return name === undefined ? [] : [name];
      }),
      platforms: snapshot.platforms,
      provenance: snapshot.provenance,
      dataMode: snapshot.data_mode,
      recommendedContent: intentRecord?.recommended_content ?? null,
      recommendedCta: intentRecord?.recommended_cta ?? null,
    });
  }

  // Export-level provenance: sources joined, latest retrieval timestamp
  // across the published snapshots.
  const publishedMetrics = metrics.filter(
    (snapshot) => snapshot.consensus === "stable" && snapshot.visibility_pct >= VISIBILITY_FLOOR_PCT,
  );
  const latestRetrieval = publishedMetrics.reduce<string | null>(
    (latest, snapshot) =>
      latest === null || snapshot.provenance.retrieved_at > latest
        ? snapshot.provenance.retrieved_at
        : latest,
    null,
  );
  if (latestRetrieval === null) {
    throw new LibInputError("lib export has no published metrics — nothing to render");
  }
  const sources = [...new Set(publishedMetrics.map((snapshot) => snapshot.provenance.source))]
    .sort()
    .join(", ");

  const intents: LibIntent[] = [...promptsByIntent.entries()].map(([intentId, entries]) => {
    const topic = topicsById.get(intentId);
    if (topic === undefined) {
      throw new LibInputError(`intent_id ${intentId} vanished from the graph mid-build`);
    }
    // Output Rule 5: within each section, prompts sorted by visibility desc
    // (ties broken by prompt_id for total determinism).
    const byVisibilityDesc = (a: LibPrompt, b: LibPrompt): number =>
      b.visibilityPct - a.visibilityPct || (a.promptId < b.promptId ? -1 : 1);
    const revenueExpansion = entries
      .filter((entry) => entry.visibilityPct >= REVENUE_SPLIT_THRESHOLD_PCT)
      .sort(byVisibilityDesc);
    const marketExpansion = entries
      .filter(
        (entry) =>
          entry.visibilityPct >= VISIBILITY_FLOOR_PCT &&
          entry.visibilityPct < REVENUE_SPLIT_THRESHOLD_PCT,
      )
      .sort(byVisibilityDesc);
    return {
      intentId,
      intentName: topic.intent_name,
      monthlySearchVolume: {
        tier: topic.volume.tier,
        monthlyVolume: topic.volume.monthly_volume,
      },
      buyerStage: topic.buyer_stage,
      intentCategory: topic.intent_category,
      revenueExpansion,
      marketExpansion,
    };
  });

  // Blueprint Stage C.3: intents sorted by demand tier desc; ties broken by
  // best published visibility desc, then intent_id asc for total determinism.
  const bestVisibility = (intent: LibIntent): number =>
    Math.max(
      intent.revenueExpansion[0]?.visibilityPct ?? -1,
      intent.marketExpansion[0]?.visibilityPct ?? -1,
    );
  intents.sort((a, b) => {
    const tierDelta =
      DEMAND_TIER_RANK[b.monthlySearchVolume.tier] - DEMAND_TIER_RANK[a.monthlySearchVolume.tier];
    if (tierDelta !== 0) {
      return tierDelta;
    }
    const visibilityDelta = bestVisibility(b) - bestVisibility(a);
    if (visibilityDelta !== 0) {
      return visibilityDelta;
    }
    return a.intentId < b.intentId ? -1 : 1;
  });

  return {
    exportSpec: "Buyer Intent GEO Export v2",
    brandId: graph.brand_id,
    industry: input.industry ?? null,
    dataMode,
    provenance: { source: sources, retrieved_at: latestRetrieval },
    competitors: graph.competitors.map((competitor) => ({
      brandId: competitor.brand_id,
      name: competitor.name,
    })),
    intents,
    excluded,
  };
}
