/**
 * Stage B.1 — deterministic intent selection (blueprint "B.1 — Intent
 * selection"). Candidates are ranked by the Monitor Skill's selection
 * rule — high demand OR high differentiation (open gap: Void Rate at or
 * above the 25% opportunity threshold) — with documented tie-breaking
 * (volume tier desc, then gap desc, then intent_id) so re-running Stage B
 * on the same graph never shuffles the batch: the human at Gate 2
 * confirms a stable list, not a new lottery each time.
 *
 * The customer can hand-replace up to half the batch; replaced slots keep
 * their place and record the replacement as an override with the picker's
 * note. Selection is pure and deterministic — no LLM in the ranking path.
 */

import type { DemandTier, MarketingGraph } from "@intentvisible/core-schema";
import { VOID_OPPORTUNITY_THRESHOLD_PCT } from "@intentvisible/metrics";

export const DEFAULT_BATCH_SIZE = 8;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 20;

/** Volume tiers ranked best-first for the tie-break (high > medium > low). */
const TIER_RANK: Record<DemandTier, number> = { high: 0, medium: 1, low: 2 };

export type SelectionReason = "high_demand" | "open_gap" | "high_demand_and_open_gap" | "override";

/** One ranked graph intent topic, with the dimensions the ranking used. */
export interface RankedIntent {
  intent_id: string;
  intent_name: string;
  buyer_stage: MarketingGraph["intent_topics"][number]["buyer_stage"];
  intent_category: MarketingGraph["intent_topics"][number]["intent_category"];
  volume_tier: DemandTier;
  void_rate_pct: number;
  gap_open: boolean;
  /** Why the intent is in (or was placed into) the batch. */
  selection_reason: SelectionReason;
  /** 1-based position in the eligible ranking (a replaced slot keeps its rank). */
  rank: number;
}

/** A candidate that failed the selection rule, with the numbers that ruled it out. */
export interface ExcludedIntent {
  intent_id: string;
  intent_name: string;
  volume_tier: DemandTier;
  void_rate_pct: number;
  detail: string;
}

/** A customer hand-replacement: one batch slot swapped, with the note. */
export interface SelectionOverride {
  /** 1-based batch slot that was replaced. */
  slot: number;
  dropped_intent_id: string;
  added_intent_id: string;
  note: string;
}

/** One customer replacement request (validated before it becomes an override). */
export interface SelectionReplacement {
  drop_intent_id: string;
  add_intent_id: string;
  note?: string;
}

export interface IntentSelection {
  /** The final ordered batch (overrides already applied). */
  batch: RankedIntent[];
  /** The full eligible ranking the batch was cut from. */
  ranked: RankedIntent[];
  /** Candidates the selection rule ruled out. */
  excluded: ExcludedIntent[];
  /** Hand-replacements applied to the batch, in the order given. */
  overrides: SelectionOverride[];
}

export interface SelectOptions {
  /** Batch size 1–20; defaults to 8 (blueprint B.1). */
  batch_size?: number;
}

/** True when the intent clears the Monitor Skill bar: high demand or an open gap. */
export function isEligibleForSelection(topic: {
  volume: { tier: DemandTier };
  gap: { void_rate_pct: number };
}): boolean {
  return topic.volume.tier === "high" || topic.gap.void_rate_pct >= VOID_OPPORTUNITY_THRESHOLD_PCT;
}

/**
 * The documented total order over eligible candidates: volume tier desc,
 * then gap desc (a higher Void Rate is a more open gap), then intent_id —
 * the last key makes the order total, so identical graphs sort identically.
 */
function compareRanked(a: RankedIntent, b: RankedIntent): number {
  const tierDelta = TIER_RANK[a.volume_tier] - TIER_RANK[b.volume_tier];
  if (tierDelta !== 0) {
    return tierDelta;
  }
  if (b.void_rate_pct !== a.void_rate_pct) {
    return b.void_rate_pct - a.void_rate_pct;
  }
  if (a.intent_id < b.intent_id) {
    return -1;
  }
  return a.intent_id > b.intent_id ? 1 : 0;
}

function toRanked(topic: MarketingGraph["intent_topics"][number], rank: number): RankedIntent {
  const highDemand = topic.volume.tier === "high";
  const gapOpen = topic.gap.void_rate_pct >= VOID_OPPORTUNITY_THRESHOLD_PCT;
  return {
    intent_id: topic.intent_id,
    intent_name: topic.intent_name,
    buyer_stage: topic.buyer_stage,
    intent_category: topic.intent_category,
    volume_tier: topic.volume.tier,
    void_rate_pct: topic.gap.void_rate_pct,
    gap_open: gapOpen,
    selection_reason: highDemand && gapOpen ? "high_demand_and_open_gap" : highDemand ? "high_demand" : "open_gap",
    rank,
  };
}

/**
 * Ranks every graph intent topic: eligible candidates best-first, then the
 * excluded remainder (also tie-broken, so the exclusion list is stable).
 * Pure — same graph, same ranking.
 */
export function rankIntentTopics(graph: MarketingGraph): { ranked: RankedIntent[]; excluded: ExcludedIntent[] } {
  const eligible = graph.intent_topics.filter(isEligibleForSelection).map((topic) => toRanked(topic, 0));
  eligible.sort(compareRanked);
  eligible.forEach((intent, index) => {
    intent.rank = index + 1;
  });

  const eligibleIds = new Set(eligible.map((intent) => intent.intent_id));
  const excluded = graph.intent_topics
    .filter((topic) => !eligibleIds.has(topic.intent_id))
    .map((topic): ExcludedIntent => ({
      intent_id: topic.intent_id,
      intent_name: topic.intent_name,
      volume_tier: topic.volume.tier,
      void_rate_pct: topic.gap.void_rate_pct,
      detail:
        topic.volume.tier === "high"
          ? "unreachable: a high-demand intent cannot be excluded by the selection rule"
          : `volume tier "${topic.volume.tier}" is not high and the gap is closed (void rate ${topic.gap.void_rate_pct}% < ${VOID_OPPORTUNITY_THRESHOLD_PCT}%)`,
    }));
  return { ranked: eligible, excluded };
}

/**
 * Cuts the batch from the eligible ranking. Deterministic given the graph:
 * the same graph and batch size always yield the same batch.
 *
 * Throws a RangeError for a batch size outside 1–20 — a caller bug, not a
 * job failure (the API validates the customer's batch size first).
 */
export function selectIntents(graph: MarketingGraph, options: SelectOptions = {}): IntentSelection {
  const batchSize = options.batch_size ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < MIN_BATCH_SIZE || batchSize > MAX_BATCH_SIZE) {
    throw new RangeError(`batch_size must be an integer between ${MIN_BATCH_SIZE} and ${MAX_BATCH_SIZE}, got ${batchSize}`);
  }
  const { ranked, excluded } = rankIntentTopics(graph);
  return { batch: ranked.slice(0, batchSize), ranked, excluded, overrides: [] };
}

/**
 * Applies the customer's hand-replacements to a selection. Each
 * replacement swaps one selected intent for another graph intent (the
 * human may reach past the rule — that is what a hand-replacement is for);
 * the slot keeps its place and the override record carries the picker's
 * note. At most half the batch can be replaced (blueprint B.1).
 *
 * Throws RangeError for structurally impossible replacements — a drop not
 * in the batch, an add already in it or absent from the graph, duplicate
 * use of the same slot or intent, or more than half the batch replaced.
 * The API surfaces those to the customer as 4xx validation errors.
 */
export function applySelectionOverrides(
  selection: IntentSelection,
  graph: MarketingGraph,
  replacements: readonly SelectionReplacement[],
): IntentSelection {
  const maxOverrides = Math.floor(selection.batch.length / 2);
  if (replacements.length > maxOverrides) {
    throw new RangeError(`at most ${maxOverrides} of ${selection.batch.length} slots can be hand-replaced, got ${replacements.length}`);
  }

  const topicIds = new Set(graph.intent_topics.map((topic) => topic.intent_id));
  const batch = selection.batch.map((intent) => ({ ...intent }));
  const overrides: SelectionOverride[] = [];
  const usedSlots = new Set<number>();
  const addedIds = new Set<string>();

  for (const replacement of replacements) {
    const slot = batch.findIndex((intent) => intent.intent_id === replacement.drop_intent_id);
    if (slot === -1) {
      throw new RangeError(`cannot replace "${replacement.drop_intent_id}": it is not in the batch`);
    }
    if (usedSlots.has(slot)) {
      throw new RangeError(`slot ${slot + 1} ("${replacement.drop_intent_id}") is replaced more than once`);
    }
    if (!topicIds.has(replacement.add_intent_id)) {
      throw new RangeError(`cannot add "${replacement.add_intent_id}": it is not an intent topic in the graph`);
    }
    if (addedIds.has(replacement.add_intent_id)) {
      throw new RangeError(`cannot add "${replacement.add_intent_id}": it was already added by an earlier replacement`);
    }
    if (batch.some((intent) => intent.intent_id === replacement.add_intent_id)) {
      throw new RangeError(`cannot add "${replacement.add_intent_id}": it is already in the batch`);
    }
    usedSlots.add(slot);
    addedIds.add(replacement.add_intent_id);

    // The replacement is rebuilt from its own graph topic — it must not
    // inherit the dropped intent's dimensions, stage, or category. Only
    // the slot (and its rank) carries over.
    const addedTopic = graph.intent_topics.find((topic) => topic.intent_id === replacement.add_intent_id);
    const dropped = batch[slot];
    if (addedTopic === undefined || dropped === undefined) {
      throw new RangeError(`cannot apply replacement for slot ${slot + 1}: intent or slot no longer resolves`);
    }
    batch[slot] = {
      ...toRanked(addedTopic, dropped.rank),
      selection_reason: "override",
    };
    overrides.push({
      slot: slot + 1,
      dropped_intent_id: replacement.drop_intent_id,
      added_intent_id: replacement.add_intent_id,
      note: replacement.note ?? "",
    });
  }

  return { batch, ranked: selection.ranked, excluded: selection.excluded, overrides };
}
