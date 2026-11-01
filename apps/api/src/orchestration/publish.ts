/**
 * Stage C.3 lib publish (blueprint): render the Buyer Intent Lib from the
 * baseline's stored records, then flip every published intent to
 * simulated/measured with full measurement provenance (source, model_id,
 * date range) and bump its version (Verification #8). A publish is a pure
 * build over validated inputs — the same inputs render the same lib, yaml,
 * document, and record set.
 */

import { createHash } from "node:crypto";

import {
  IntentRecordV2Schema,
  type IntentRecordV2,
  type MarketingGraph,
  type MetricsSnapshot,
  type PromptRecord,
} from "@intentvisible/core-schema";
import {
  buildLibExport,
  renderDocumentExport,
  renderYamlExport,
} from "@intentvisible/intent-lib-export";
import type { Clock, MonitoringPlan } from "@intentvisible/intent-engine";

import type { LibPublishRecord } from "./types.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Confidence mirrors the graph's own evidence tier (priority S/A/B). */
const CONFIDENCE_BY_PRIORITY = { S: "high", A: "high", B: "medium" } as const;

export interface BuildPublishInput {
  projectId: string;
  plan: MonitoringPlan;
  graph: MarketingGraph;
  /** The plan's confirmed prompts — the publish's measurement set. */
  prompts: readonly PromptRecord[];
  /** Pooled per-prompt snapshots (prompt_id set) — the lib join key. */
  pooledPerPrompt: readonly MetricsSnapshot[];
  /** Pooled per-intent snapshots — each published record's visibility. */
  pooledPerIntent: readonly MetricsSnapshot[];
  /** Current published version per intent_id (absent = first publish). */
  existingVersions: ReadonlyMap<string, number>;
  clock: Clock;
}

export interface BuiltPublish {
  publish: LibPublishRecord;
  records: IntentRecordV2[];
}

export function buildPublish(input: BuildPublishInput): BuiltPublish {
  const { plan, graph, prompts, clock } = input;
  if (prompts.length === 0) {
    throw new RangeError("cannot publish a lib with no prompts");
  }

  const lib = buildLibExport({
    graph,
    prompts: [...prompts],
    metrics: [...input.pooledPerPrompt],
  });

  const publishedAt = clock.isoNow();
  const topicsById = new Map(graph.intent_topics.map((topic) => [topic.intent_id, topic]));
  const pooledByIntent = new Map(
    input.pooledPerIntent.map((snapshot) => [snapshot.intent_id, snapshot]),
  );
  const confirmedTextsByIntent = new Map<string, string[]>();
  for (const prompt of [...prompts].sort((a, b) => a.prompt_id.localeCompare(b.prompt_id))) {
    if (prompt.status !== "confirmed") {
      continue;
    }
    const texts = confirmedTextsByIntent.get(prompt.intent_id) ?? [];
    texts.push(prompt.text);
    confirmedTextsByIntent.set(prompt.intent_id, texts);
  }

  const flipped: LibPublishRecord["flipped"] = [];
  const records: IntentRecordV2[] = [];
  for (const [intentId, promptTexts] of [...confirmedTextsByIntent.entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const topic = topicsById.get(intentId);
    if (topic === undefined) {
      throw new RangeError(
        `confirmed prompt set references intent ${intentId} which is not in the graph`,
      );
    }
    // A published record is a measured record: no snapshot, no publish.
    const pooled = pooledByIntent.get(intentId);
    if (pooled === undefined) {
      throw new RangeError(
        `intent ${intentId} has no pooled metrics snapshot — publish without measurement is rejected`,
      );
    }
    const fromVersion = input.existingVersions.get(intentId) ?? 0;
    const toVersion = fromVersion + 1;
    const measured = plan.data_mode === "provider_measured";

    records.push(
      IntentRecordV2Schema.parse({
        schema_version: "2.0.0",
        intent_id: intentId,
        intent_version: toVersion,
        scope: "brand",
        brand_id: plan.brand_id,
        intent_name: topic.intent_name,
        buyer_stage: topic.buyer_stage,
        intent_category: topic.intent_category,
        country: plan.country,
        language: plan.language,
        prompts: promptTexts,
        sku_ids: [],
        evidence_urls: topic.evidence_urls,
        generation_method: "llm_with_page_evidence",
        generation_model: graph.provenance.source,
        measurement_status: measured ? "measured" : "simulated",
        measurement_source: pooled.provider_model,
        measurement_provenance: {
          source: pooled.provenance.source,
          model_id: pooled.provider_model,
          date_range: pooled.date_range,
        },
        visibility_pct: pooled.visibility_pct,
        monthly_search_volume: measured ? (topic.volume.monthly_volume ?? null) : null,
        confidence: CONFIDENCE_BY_PRIORITY[topic.priority],
        generated_at: publishedAt,
      }),
    );
    flipped.push({ intent_id: intentId, from_version: fromVersion, to_version: toVersion });
  }

  if (records.length === 0) {
    throw new RangeError("cannot publish a lib with zero published intents");
  }

  const models = [...new Set(input.pooledPerIntent.map((snapshot) => snapshot.provider_model))]
    .sort()
    .join(", ");
  const fromDates = input.pooledPerIntent.map((snapshot) => snapshot.date_range.from).sort();
  const toDates = input.pooledPerIntent.map((snapshot) => snapshot.date_range.to).sort();
  const earliest = fromDates[0];
  const latest = toDates[toDates.length - 1];
  if (earliest === undefined || latest === undefined) {
    throw new RangeError("cannot publish without pooled metrics snapshots");
  }
  const publish: LibPublishRecord = {
    publish_id: `pub_${sha256(`${plan.plan_id}|${publishedAt}|${flipped.length}`).slice(0, 24)}`,
    project_id: input.projectId,
    plan_id: plan.plan_id,
    lib,
    yaml_export: renderYamlExport(lib),
    document_export: renderDocumentExport(lib),
    provenance: {
      source: lib.provenance.source,
      model_id: models,
      date_range: { from: earliest, to: latest },
      data_mode: plan.data_mode,
    },
    flipped,
    published_at: publishedAt,
  };
  return { publish, records };
}

/**
 * Re-publishes one drifted intent: version bump with the cycle's fresh
 * measurement and provenance (blueprint Iteration — drift >10 pts bumps the
 * intent version). Only measurement fields move; the graph-derived content
 * stays the version it was published at.
 */
export function bumpPublishedRecord(
  existing: IntentRecordV2,
  pooled: MetricsSnapshot,
  clock: Clock,
): IntentRecordV2 {
  return IntentRecordV2Schema.parse({
    ...existing,
    intent_version: existing.intent_version + 1,
    measurement_status: pooled.data_mode === "provider_measured" ? "measured" : "simulated",
    measurement_source: pooled.provider_model,
    measurement_provenance: {
      source: pooled.provenance.source,
      model_id: pooled.provider_model,
      date_range: pooled.date_range,
    },
    visibility_pct: pooled.visibility_pct,
    generated_at: clock.isoNow(),
  });
}
