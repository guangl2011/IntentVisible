/**
 * Stage A evidence integrity (blueprint validation family 1): every claim
 * cites a crawled snapshot URL or carries the explicit assumption flag —
 * an uncited fact is a typed drop, never a silent field — and the
 * assembled graph must cite at least the evidence floor. A graph that
 * cannot cite enough pages fails loudly instead of inventing.
 */

import type { Trait } from "@intentvisible/core-schema";

/**
 * The low-evidence floor (blueprint Stage A risk note: "a graph that
 * can't cite enough pages fails loudly instead of inventing"): the
 * distinct crawl URLs cited by non-assumption claims across the whole
 * graph must reach this minimum. A sparse 1–2 page crawl cannot clear it.
 */
export const MIN_GRAPH_EVIDENCE_PAGES = 3;

/** Why one Stage A modeling claim or node was dropped (QA log only — dropped pieces are never stored). */
export const STAGE_A_DROP_REASONS = [
  "unevidenced_claim",
  "missing_evidence",
  "schema_invalid",
  "duplicate",
  "self_competitor",
  "persona_incomplete",
  "capacity",
] as const;
export type StageADropReason = (typeof STAGE_A_DROP_REASONS)[number];

export interface StageADropEvent {
  /** Which node or claim was dropped, e.g. "personas[Weekend Camper].core_frustrations[0]". */
  subject: string;
  reason: StageADropReason;
  detail: string;
}

/**
 * The model's raw claim shape, before validation: the model is told to
 * either cite crawl URLs or flag the claim as an assumption, and this
 * shape tolerates a misbehaving model long enough to drop the claim with
 * a typed event instead of failing the whole response.
 */
export interface RawTrait {
  text: string;
  assumption?: boolean;
  evidence_urls?: string[];
}

export type TraitValidationOutcome =
  | { ok: true; trait: Trait }
  | { ok: false; event: StageADropEvent };

/**
 * Validates one claim against the crawl registry: uncited facts and facts
 * citing pages outside the registry are dropped. An assumption claim
 * carries no evidence URLs — a URL on an assumption would dress a guess
 * up as a citation.
 */
export function validateTrait(
  raw: RawTrait,
  registry: ReadonlySet<string>,
  subject: string,
): TraitValidationOutcome {
  const assumption = raw.assumption === true;
  const urls = raw.evidence_urls ?? [];
  if (!assumption && urls.length === 0) {
    return {
      ok: false,
      event: {
        subject,
        reason: "unevidenced_claim",
        detail: `claim neither cites a crawled page nor flags itself as an assumption: "${raw.text}"`,
      },
    };
  }
  const unknown = urls.filter((url) => !registry.has(url));
  if (unknown.length > 0) {
    return {
      ok: false,
      event: {
        subject,
        reason: "unevidenced_claim",
        detail: `claim cites URLs outside the crawl registry: ${unknown.join(", ")}`,
      },
    };
  }
  return {
    ok: true,
    trait: { text: raw.text, assumption, evidence_urls: assumption ? [] : urls },
  };
}

/** Distinct crawl URLs cited by non-assumption claims and node evidence across the graph. */
export function collectGraphEvidenceUrls(
  graph: {
    value_proposition: Trait;
    moats: Trait[];
    competitors: Array<{ claims: Trait[]; evidence_urls: string[] }>;
    personas: Array<{
      demographics: Trait;
      core_frustrations: Trait[];
      cognitive_biases: Trait[];
      decision_triggers: Trait[];
      ai_language_fingerprint: Trait;
    }>;
    scenarios: Array<{ description: Trait }>;
    intent_topics: Array<{ evidence_urls: string[] }>;
  },
): Set<string> {
  const cited = new Set<string>();
  const traits: Trait[] = [
    graph.value_proposition,
    ...graph.moats,
    ...graph.personas.flatMap((persona) => [
      persona.demographics,
      ...persona.core_frustrations,
      ...persona.cognitive_biases,
      ...persona.decision_triggers,
      persona.ai_language_fingerprint,
    ]),
    ...graph.scenarios.map((scenario) => scenario.description),
  ];
  for (const trait of traits) {
    if (trait.assumption) {
      continue;
    }
    for (const url of trait.evidence_urls) {
      cited.add(url);
    }
  }
  for (const competitor of graph.competitors) {
    for (const url of competitor.evidence_urls) {
      cited.add(url);
    }
  }
  for (const topic of graph.intent_topics) {
    for (const url of topic.evidence_urls) {
      cited.add(url);
    }
  }
  return cited;
}
