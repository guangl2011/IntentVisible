import type { z } from "zod";

import { MetricsSnapshotSchema, MonitoringRunSchema } from "@intentvisible/core-schema";

import { consensusFlag, type ConsensusFlag } from "./consensus.js";
import { MixedDataModeError, MetricsInputError } from "./errors.js";
import {
  citationShares,
  isHighDifferentiationOpportunity,
  leaderGap,
  visibilityPct,
  voidRatePct,
} from "./formulas.js";
import { domainFromUrl, parseAnswer } from "./parse.js";
import { round2, sentimentIndex } from "./sentiment.js";
import type { BrandAliasConfig, BrandId, ParsedAnswer } from "./types.js";

/**
 * Aggregation over stored monitoring runs (blueprint Stage C.2). Metrics
 * are pure derivations of the immutable raw answers — nothing here writes
 * or mutates a run; every output snapshot carries the full provenance
 * block (run count, platforms, date range, provider/model, data_mode)
 * that MetricsSnapshotSchema requires.
 */

export type MonitoringRun = z.infer<typeof MonitoringRunSchema>;
export type MetricsSnapshot = z.infer<typeof MetricsSnapshotSchema>;

export interface ComputeMetricsOptions {
  /** The monitored brand these metrics describe. */
  brandId: BrandId;
  /** Intent the runs belong to (snapshots group per prompt × platform). */
  intentId: string;
  /** Brand/competitor alias lexicon for the parser. */
  aliases: BrandAliasConfig;
  /** Defaults to "2.0.0". */
  schemaVersion?: string;
}

/** A prompt × platform group of baseline runs, plus its parsed answers. */
interface RunGroup {
  promptId: string;
  platform: string;
  runs: MonitoringRun[];
  parsed: ParsedAnswer[];
}

/** Reject anything that is not a valid stored run before deriving from it. */
function validatedRuns(runs: ReadonlyArray<MonitoringRun>): MonitoringRun[] {
  return runs.map((run) => MonitoringRunSchema.parse(run));
}

/** One monitoring plan is one data mode — mixed baselines never aggregate. */
function assertSingleDataMode(runs: ReadonlyArray<MonitoringRun>): string {
  const modes = [...new Set(runs.map((run) => run.data_mode))];
  if (modes.length > 1) {
    throw new MixedDataModeError(modes);
  }
  const mode = modes[0];
  if (mode === undefined) {
    throw new MetricsInputError("no runs to derive a data mode from");
  }
  return mode;
}

/** Deterministic mtrc_ id from the snapshot's grouping coordinates. */
function snapshotId(parts: ReadonlyArray<string>): string {
  const slug = parts
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 95);
  return `mtrc_${slug}`;
}

function groupRuns(runs: ReadonlyArray<MonitoringRun>): Map<string, RunGroup> {
  const groups = new Map<string, RunGroup>();
  for (const run of runs) {
    const key = `${run.prompt_id}|${run.platform}`;
    const group = groups.get(key) ?? {
      promptId: run.prompt_id,
      platform: run.platform,
      runs: [],
      parsed: [],
    };
    group.runs.push(run);
    groups.set(key, group);
  }
  return groups;
}

function parseGroup(group: RunGroup, aliases: BrandAliasConfig): void {
  group.runs.sort((a, b) => a.round - b.round || a.run_id.localeCompare(b.run_id));
  group.parsed = group.runs.map((run) => parseAnswer(run.raw_answer, aliases));
}

/** Count answers that recommend no monitored competitor (void answers). */
function countVoidAnswers(group: RunGroup, options: ComputeMetricsOptions): number {
  const competitorIds = new Set(options.aliases.competitors.map((c) => c.id));
  return group.parsed.filter(
    (answer) => !answer.brands_recommended.some((id) => competitorIds.has(id)),
  ).length;
}

/** Per-domain citation counts, deduplicated within each answer. */
function citationCounts(group: RunGroup): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const answer of group.parsed) {
    for (const url of new Set(answer.citations.map(domainFromUrl))) {
      counts[url] = (counts[url] ?? 0) + 1;
    }
  }
  return counts;
}

function competitorVisibilityPcts(
  group: RunGroup,
  options: ComputeMetricsOptions,
): Array<{ competitorId: BrandId; visibilityPct: number }> {
  const total = group.runs.length;
  return options.aliases.competitors.map(({ id }) => ({
    competitorId: id,
    visibilityPct: round2(
      (group.parsed.filter((answer) => (answer.competitor_mentions[id] ?? 0) > 0).length / total) *
        100,
    ),
  }));
}

/** Brand visibility of each baseline round, in round order. */
function roundVisibilities(group: RunGroup, options: ComputeMetricsOptions): number[] {
  const byRound = new Map<number, MonitoringRun[]>();
  for (const run of group.runs) {
    const bucket = byRound.get(run.round) ?? [];
    bucket.push(run);
    byRound.set(run.round, bucket);
  }
  return [...byRound.keys()].sort((a, b) => a - b).map((round) => {
    const runs = byRound.get(round) ?? [];
    const mentions = runs.filter((run) => parseAnswer(run.raw_answer, options.aliases).brand_mentioned)
      .length;
    return visibilityPct(mentions, runs.length);
  });
}

function provenanceOf(group: RunGroup) {
  const ranAt = group.runs.map((run) => run.ran_at);
  const from = ranAt.reduce((a, b) => (a <= b ? a : b));
  const to = ranAt.reduce((a, b) => (a >= b ? a : b));
  const providerModel = [...new Set(group.runs.map((run) => run.model_id))]
    .sort()
    .join(", ");
  return { from, to, providerModel };
}

/**
 * Compute the per-(prompt, platform) metric snapshots for one baseline.
 * Every snapshot is validated against core-schema's MetricsSnapshotSchema
 * before it is returned — a derived number that could not carry its
 * provenance fails here, never downstream.
 *
 * Requires: at least one run, a single data_mode across all runs, and at
 * least two baseline rounds per prompt × platform group (Monitor Skill
 * minimum for run-to-run drift).
 */
export function computeMetrics(
  runs: ReadonlyArray<MonitoringRun>,
  options: ComputeMetricsOptions,
): MetricsSnapshot[] {
  if (runs.length === 0) {
    throw new MetricsInputError("cannot compute metrics from zero runs");
  }
  const valid = validatedRuns(runs);
  const dataMode = assertSingleDataMode(valid);

  const snapshots: MetricsSnapshot[] = [];
  for (const group of groupRuns(valid).values()) {
    parseGroup(group, options.aliases);
    const rounds = roundVisibilities(group, options);
    const consensus: ConsensusFlag = consensusFlag(rounds);

    const total = group.runs.length;
    const brandMentions = group.parsed.filter((answer) => answer.brand_mentioned).length;
    const brandVisibility = visibilityPct(brandMentions, total);
    const gap = leaderGap(brandVisibility, competitorVisibilityPcts(group, options));
    const voidRate = voidRatePct(countVoidAnswers(group, options), total);
    const allFacts = group.parsed.flatMap((answer) => answer.sentiment_facts);
    const { from, to, providerModel } = provenanceOf(group);

    snapshots.push(
      MetricsSnapshotSchema.parse({
        schema_version: options.schemaVersion ?? "2.0.0",
        metrics_id: snapshotId([options.brandId, options.intentId, group.promptId, group.platform]),
        brand_id: options.brandId,
        intent_id: options.intentId,
        prompt_id: group.promptId,
        platform: group.platform,
        visibility_pct: brandVisibility,
        top_competitor_id: gap.topCompetitorId,
        leader_gap_pct: gap.gapPct,
        void_rate_pct: voidRate,
        sentiment_index: sentimentIndex(allFacts),
        citation_share: citationShares(citationCounts(group)),
        consensus,
        run_count: total,
        platforms: [group.platform],
        date_range: { from, to },
        provider_model: providerModel,
        data_mode: dataMode,
        provenance: { source: providerModel, retrieved_at: to },
      }),
    );
  }
  return snapshots.sort((a, b) => a.metrics_id.localeCompare(b.metrics_id));
}

/**
 * Pooled variant of {@link computeMetrics}: one snapshot across the whole
 * intent (no prompt_id/platform). Pooling never hides noise — the pooled
 * consensus is stable only when every per-group consensus is stable.
 */
export function computePooledMetrics(
  runs: ReadonlyArray<MonitoringRun>,
  options: ComputeMetricsOptions,
): MetricsSnapshot {
  if (runs.length === 0) {
    throw new MetricsInputError("cannot compute metrics from zero runs");
  }
  const valid = validatedRuns(runs);
  const dataMode = assertSingleDataMode(valid);

  const groups = [...groupRuns(valid).values()];
  for (const group of groups) {
    parseGroup(group, options.aliases);
  }
  const groupConsensus = groups.map((group) =>
    consensusFlag(roundVisibilities(group, options)),
  );
  const parsed = groups.flatMap((group) => group.parsed);
  const total = valid.length;
  const brandMentions = parsed.filter((answer) => answer.brand_mentioned).length;
  const brandVisibility = visibilityPct(brandMentions, total);

  const competitorVisibilities = options.aliases.competitors.map(({ id }) => ({
    competitorId: id,
    visibilityPct: round2(
      (parsed.filter((answer) => (answer.competitor_mentions[id] ?? 0) > 0).length / total) * 100,
    ),
  }));
  const gap = leaderGap(brandVisibility, competitorVisibilities);

  const competitorIds = new Set(options.aliases.competitors.map((c) => c.id));
  const voidAnswers = parsed.filter(
    (answer) => !answer.brands_recommended.some((id) => competitorIds.has(id)),
  ).length;

  const citationCounts: Record<string, number> = {};
  for (const answer of parsed) {
    for (const domain of new Set(answer.citations.map(domainFromUrl))) {
      citationCounts[domain] = (citationCounts[domain] ?? 0) + 1;
    }
  }

  const ranAt = valid.map((run) => run.ran_at);
  const from = ranAt.reduce((a, b) => (a <= b ? a : b));
  const to = ranAt.reduce((a, b) => (a >= b ? a : b));
  const providerModel = [...new Set(valid.map((run) => run.model_id))].sort().join(", ");
  const platforms = [...new Set(valid.map((run) => run.platform))].sort();

  return MetricsSnapshotSchema.parse({
    schema_version: options.schemaVersion ?? "2.0.0",
    metrics_id: snapshotId([options.brandId, options.intentId, "pooled"]),
    brand_id: options.brandId,
    intent_id: options.intentId,
    visibility_pct: brandVisibility,
    top_competitor_id: gap.topCompetitorId,
    leader_gap_pct: gap.gapPct,
    void_rate_pct: voidRatePct(voidAnswers, total),
    sentiment_index: sentimentIndex(parsed.flatMap((answer) => answer.sentiment_facts)),
    citation_share: citationShares(citationCounts),
    consensus: groupConsensus.every((flag) => flag === "stable") ? "stable" : "noisy",
    run_count: total,
    platforms,
    date_range: { from, to },
    provider_model: providerModel,
    data_mode: dataMode,
    provenance: { source: providerModel, retrieved_at: to },
  });
}

/** Convenience re-export: the derived (never stored) opportunity tag. */
export { isHighDifferentiationOpportunity };
