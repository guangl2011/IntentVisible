/**
 * Semantic deduplication and intent versioning (spec Flow, Validate + dedup
 * row): near-duplicate candidates are merged into the existing intent_id
 * with a version bump instead of being stored as separate billable intents.
 *
 * The clustering is deliberately conservative and fully deterministic:
 *
 * 1. Market partitioning — candidates only compete within the same
 *    (scope, brand, country, language) partition. An AU/en intent and a
 *    DE/de intent are different intents even when they describe the same
 *    underlying question.
 * 2. Exact semantic key — within a category, a shared topic (the model's
 *    own semantic label) or a shared intent name counts as the same
 *    intent. Stored records carry no topic, so name keys are the family
 *    a regeneration matches them on; topic keys catch reworded names
 *    within and across runs.
 * 3. Fuzzy name fallback — without a topic, token-set (Jaccard) overlap of
 *    the intent names at ≥ 0.5 within the same category counts as the same
 *    intent.
 *
 * This is deliberately lexical, deterministic clustering — no embedding
 * call, no nondeterminism. Deeper paraphrase detection (embedding
 * similarity) is a later provider-adapter concern, not hidden here.
 *
 * Reused ids get version = matched version + 1 (the reworded record becomes
 * the new current version). First occurrences mint fresh name-derived ids
 * (the plan's `int_camping_fridge_runtime` example), suffixed on collision.
 * Ids are unique per record: two same-topic drafts in one run share the id
 * with sequential versions (1, 2, …), and a persistence layer keeps the
 * highest version per intent_id as current.
 */

import type { IntentCategory, IntentRecord, Scope } from "@intentvisible/core-schema";

import type { ValidatedDraft } from "./validate.js";
import { slugify } from "./slug.js";

/** Version-bump token overlap: names sharing half their words are the same intent. */
const NAME_SIMILARITY_THRESHOLD = 0.5;

/** Everything dedup needs to know about an intent already in the library. */
export interface ExistingIntentSummary {
  intent_id: string;
  scope: Scope;
  brand_id: string;
  country: string;
  language: string;
  intent_category: IntentCategory;
  topic?: string;
  intent_name: string;
  intent_version: number;
}

export interface IntentAssignment {
  draft: ValidatedDraft;
  intent_id: string;
  intent_version: number;
  /** true when the id reuses an existing library intent (rewording, not a new intent). */
  reused: boolean;
}

export interface DedupReport {
  assigned: IntentAssignment[];
  /** Assignments that reused an existing library id. */
  reused: number;
  /** Assignments that minted a fresh id. */
  fresh: number;
}

/** Projects a stored record onto the summary view dedup matches against. */
export function summaryOf(record: IntentRecord): ExistingIntentSummary {
  return {
    intent_id: record.intent_id,
    scope: record.scope,
    brand_id: record.brand_id,
    country: record.country,
    language: record.language,
    intent_category: record.intent_category,
    topic: undefined,
    intent_name: record.intent_name,
    intent_version: record.intent_version,
  };
}

/** Lowercase word tokens, deduplicated — the Jaccard material. */
function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFKD")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

/** Jaccard similarity of two token sets; 0 when either side is empty. */
export function tokenOverlap(a: string, b: string): number {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

interface PartitionMember {
  /** Topic key when a topic exists — semantic match material. */
  topicKey?: string;
  /** Name key always present — stored records have no topic, so name keys
   * are the only family a regeneration can match them on. */
  nameKey: string;
  intentName: string;
  intentCategory: IntentCategory;
  intent_id: string;
  intent_version: number;
  reused: boolean;
}

function partitionKey(scope: Scope, brandId: string, country: string, language: string): string {
  return `${scope}|${brandId}|${country}|${language}`;
}

/** Match keys: same category AND same topic, or same category AND same name. */
function topicKeyOf(category: IntentCategory, topic: string | undefined): string | undefined {
  if (topic === undefined || topic === "") {
    return undefined;
  }
  return `${category}|topic:${slugify(topic)}`;
}

function nameKeyOf(category: IntentCategory, name: string): string {
  return `${category}|name:${slugify(name)}`;
}

/** Fresh stable id for a first-generation intent, collision-guarded. */
export function freshIntentId(idMaterial: string, usedIds: ReadonlySet<string>): string {
  const base = slugify(idMaterial) || "unnamed";
  const candidate = `int_${base}`;
  if (!usedIds.has(candidate)) {
    return candidate;
  }
  for (let n = 2; n < 100; n++) {
    const suffixed = `int_${base.slice(0, 100 - String(n).length - 1)}_${n}`;
    if (!usedIds.has(suffixed)) {
      return suffixed;
    }
  }
  throw new Error(`could not derive a unique intent_id for "${idMaterial}"`);
}

/**
 * Assigns stable intent ids to validated drafts, reusing existing library
 * ids for semantic duplicates (with a version bump) and minting fresh ids
 * otherwise. Input order is preserved; the result is deterministic.
 */
export function dedupDrafts(
  drafts: readonly ValidatedDraft[],
  existing: readonly ExistingIntentSummary[],
): DedupReport {
  const partitions = new Map<string, PartitionMember[]>();
  for (const summary of existing) {
    const key = partitionKey(summary.scope, summary.brand_id, summary.country, summary.language);
    const members = partitions.get(key) ?? [];
    members.push({
      topicKey: topicKeyOf(summary.intent_category, summary.topic),
      nameKey: nameKeyOf(summary.intent_category, summary.intent_name),
      intentName: summary.intent_name,
      intentCategory: summary.intent_category,
      intent_id: summary.intent_id,
      intent_version: summary.intent_version,
      reused: true,
    });
    partitions.set(key, members);
  }

  const usedIds = new Set<string>(existing.map((summary) => summary.intent_id));
  // Latest version seen per intent_id during this run — repeated reuse of
  // the same id bumps from the newest version, not the first match's.
  const assignedVersions = new Map<string, number>(
    existing.map((summary) => [summary.intent_id, summary.intent_version]),
  );
  const assigned: IntentAssignment[] = [];
  let reusedCount = 0;
  let freshCount = 0;

  for (const draft of drafts) {
    const key = partitionKey(draft.scope, draft.brand_id, draft.country, draft.language);
    const members = partitions.get(key) ?? [];
    const draftTopicKey = topicKeyOf(draft.intent_category, draft.topic);
    const draftNameKey = nameKeyOf(draft.intent_category, draft.intent_name);

    // 1. Exact semantic key match — same category and topic OR name material.
    const exact = members.find(
      (member) =>
        (draftTopicKey !== undefined && member.topicKey === draftTopicKey) ||
        member.nameKey === draftNameKey,
    );
    // 2. Fuzzy fallback — same category, similar names, no topic key.
    const fuzzy =
      exact ??
      members.find(
        (member) =>
          member.intentCategory === draft.intent_category &&
          tokenOverlap(member.intentName, draft.intent_name) >= NAME_SIMILARITY_THRESHOLD,
      );

    let intentId: string;
    let version: number;
    const reused = fuzzy !== undefined;
    if (fuzzy !== undefined) {
      intentId = fuzzy.intent_id;
      version = (assignedVersions.get(intentId) ?? fuzzy.intent_version) + 1;
      reusedCount += 1;
    } else {
      // Fresh ids stay name-derived (the plan's `int_camping_fridge_runtime`
      // example); the topic is match material only, so the first-seen name
      // of a merged cluster names the id.
      intentId = freshIntentId(draft.intent_name, usedIds);
      version = 1;
      freshCount += 1;
    }

    usedIds.add(intentId);
    assignedVersions.set(intentId, version);
    const assignment: IntentAssignment = { draft, intent_id: intentId, intent_version: version, reused };
    assigned.push(assignment);

    // Later drafts in this run dedup against this assignment too.
    members.push({
      topicKey: draftTopicKey,
      nameKey: draftNameKey,
      intentName: draft.intent_name,
      intentCategory: draft.intent_category,
      intent_id: intentId,
      intent_version: version,
      reused,
    });
    partitions.set(key, members);
  }

  return { assigned, reused: reusedCount, fresh: freshCount };
}
