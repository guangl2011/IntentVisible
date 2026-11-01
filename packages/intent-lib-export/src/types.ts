/**
 * Structured model of a Buyer Intent Lib export (blueprint Stage C.3/C.4).
 * `buildLibExport` produces this from stored graph/prompt/metric records —
 * it recomputes nothing and never calls an LLM; the two renderers
 * (machine YAML, human document) are deterministic projections of it.
 */

import type {
  BuyerStageV2,
  DemandTier,
  IntentCategoryV2,
  IntentRecord,
  MarketingGraph,
  MetricsSnapshot,
  PromptRecord,
  Provenance,
  RunDataMode,
} from "@intentvisible/core-schema";

/** Spec name stamped on every export so consumers can pin the contract. */
export const EXPORT_SPEC_NAME = "Buyer Intent GEO Export v2";

/** Which expansion section a prompt lands in (Export Spec v2 Output Rule 4). */
export type ExpansionSection = "revenue" | "market";

/** The visibility floor: prompts below it are never exported (Output Rule 10). */
export const VISIBILITY_FLOOR_PCT = 30;

/** The Revenue/Market split threshold (Output Rule 4). */
export const REVENUE_SPLIT_THRESHOLD_PCT = 50;

/** Why a prompt was left out of the export (kept tracked in the graph, not published). */
export interface ExcludedPromptCounts {
  /** Visibility strictly below the 30% floor (Output Rule 10). */
  belowVisibilityFloor: number;
  /** Consensus flag `noisy` — a noisy prompt's number is not published (Stage C.2). */
  noisyBaseline: number;
}

/** One published prompt record — self-contained, per Export Spec v2 Output Rule 11. */
export interface LibPrompt {
  promptId: string;
  /** Original prompt wording, preserved verbatim (Output Rule 9). */
  text: string;
  visibilityPct: number;
  buyerStage: BuyerStageV2;
  intentCategory: IntentCategoryV2;
  painPoint: string | null;
  personaName: string | null;
  scenarioContext: string | null;
  language: string;
  country: string;
  brandId: string;
  /** Competitor names monitored for this prompt, unranked. */
  competitorNames: string[];
  /** Platforms the underlying metrics were measured on. */
  platforms: string[];
  provenance: Provenance;
  dataMode: RunDataMode;
  /** From the matching intent record (carried, never generated — Stage C.3). */
  recommendedContent: string | null;
  recommendedCta: string | null;
}

/** One intent block: metadata stated once, prompts split into the two sections. */
export interface LibIntent {
  intentId: string;
  intentName: string;
  /** Demand as tier (always) plus the measured volume when provider_measured filled it. */
  monthlySearchVolume: { tier: DemandTier; monthlyVolume: number | null };
  buyerStage: BuyerStageV2;
  intentCategory: IntentCategoryV2;
  /** Visibility ≥ 50% — convert existing visibility into revenue (Spec §Revenue Expansion). */
  revenueExpansion: LibPrompt[];
  /** Visibility 30–49% — build additional authority (Spec §Market Expansion). */
  marketExpansion: LibPrompt[];
}

/** The complete structured lib both renditions project. */
export interface BuyerIntentLib {
  exportSpec: typeof EXPORT_SPEC_NAME;
  brandId: string;
  /** Optional industry label for the document header (absent in the Marketing Graph). */
  industry: string | null;
  /** One export is one data mode — the header value and every record agree. */
  dataMode: RunDataMode;
  /** Export-level provenance: sources joined, latest retrieval timestamp. */
  provenance: Provenance;
  /** Competitors copied from the Marketing Graph, input order, unranked (Output Rule 8). */
  competitors: Array<{ brandId: string; name: string }>;
  /** Intents sorted by demand tier desc, then best visibility desc, then intent_id asc. */
  intents: LibIntent[];
  excluded: ExcludedPromptCounts;
}

/** Renderer input: stored pipeline records only — no LLM, no network, no I/O. */
export interface LibExportInput {
  graph: MarketingGraph;
  /** Confirmed prompts (drafts are not exported; retired prompts are not either). */
  prompts: PromptRecord[];
  /** Stored metrics snapshots — pooled per-prompt snapshots are the join key. */
  metrics: MetricsSnapshot[];
  /** Optional intent records carrying recommended content/CTA, pain point, persona name. */
  intentRecords?: IntentRecord[];
  /** Optional industry label for the document header. */
  industry?: string;
}
