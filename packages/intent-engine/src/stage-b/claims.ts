/**
 * Stage B evidence anchoring (blueprint validation family 1): every
 * expanded prompt must restate at least one claim that already exists in
 * the Marketing Graph — citing evidence or flagged as an assumption. The
 * model quotes the claims it encodes; this module is the corpus those
 * quotes are matched against, so a prompt inventing a product fact (a
 * price point, an ingredient, a spec the site never states) has nothing
 * to anchor to and is dropped by validation.
 */

import type { MarketingGraph } from "@intentvisible/core-schema";

import { tokenOverlap } from "../dedup.js";

/** A claim usable for prompt restatement, harvested from the graph. */
export interface GraphClaim {
  text: string;
  /** Flagged assumptions are legal restatement anchors; they carry no URLs. */
  assumption: boolean;
  evidence_urls: string[];
  /** Where in the graph the claim lives, for drop-event details. */
  source: string;
}

/**
 * Harvests the graph's restatement corpus: value proposition, moats,
 * competitor claims, persona traits, and scenario descriptions. Only
 * claims that cite evidence or are flagged as assumptions qualify — the
 * same rule validateTrait enforces at Stage A time, re-checked here so a
 * hand-edited graph cannot smuggle an uncited claim into prompt grounding.
 * Order follows graph node order, so the corpus is deterministic.
 */
export function collectGraphClaims(graph: MarketingGraph): GraphClaim[] {
  const claims: GraphClaim[] = [];
  const push = (text: string, assumption: boolean, evidence_urls: string[], source: string): void => {
    if (text.length === 0) {
      return;
    }
    if (!assumption && evidence_urls.length === 0) {
      return;
    }
    claims.push({ text, assumption, evidence_urls: [...evidence_urls], source });
  };

  push(graph.value_proposition.text, graph.value_proposition.assumption, graph.value_proposition.evidence_urls, "value_proposition");
  graph.moats.forEach((moat, index) => push(moat.text, moat.assumption, moat.evidence_urls, `moats[${index}]`));
  for (const competitor of graph.competitors) {
    competitor.claims.forEach((claim, index) =>
      push(claim.text, claim.assumption, claim.evidence_urls, `competitors[${competitor.brand_id}].claims[${index}]`),
    );
  }
  for (const persona of graph.personas) {
    push(persona.demographics.text, persona.demographics.assumption, persona.demographics.evidence_urls, `personas[${persona.persona_id}].demographics`);
    persona.core_frustrations.forEach((trait, index) =>
      push(trait.text, trait.assumption, trait.evidence_urls, `personas[${persona.persona_id}].core_frustrations[${index}]`),
    );
    persona.cognitive_biases.forEach((trait, index) =>
      push(trait.text, trait.assumption, trait.evidence_urls, `personas[${persona.persona_id}].cognitive_biases[${index}]`),
    );
    persona.decision_triggers.forEach((trait, index) =>
      push(trait.text, trait.assumption, trait.evidence_urls, `personas[${persona.persona_id}].decision_triggers[${index}]`),
    );
    push(persona.ai_language_fingerprint.text, persona.ai_language_fingerprint.assumption, persona.ai_language_fingerprint.evidence_urls, `personas[${persona.persona_id}].ai_language_fingerprint`);
  }
  for (const scenario of graph.scenarios) {
    push(scenario.description.text, scenario.description.assumption, scenario.description.evidence_urls, `scenarios[${scenario.scenario_id}]`);
  }
  return claims;
}

/**
 * Restatement threshold: a quote sharing half its word tokens with a graph
 * claim counts as restating it (the same conservative Jaccard bar the v1
 * intent dedup uses). The expansion prompt instructs verbatim quotes, so
 * compliant outputs match near 1.0; paraphrases that keep half their
 * tokens still anchor, and invented facts have nothing near them.
 */
export const CLAIM_RESTATEMENT_THRESHOLD = 0.5;

/**
 * Finds the graph claim a quote restates — the best-overlap claim at or
 * above the threshold, or null when the quote matches nothing (an
 * invented fact). Deterministic: ties on overlap keep the earlier corpus
 * claim.
 */
export function matchClaim(quote: string, corpus: readonly GraphClaim[]): GraphClaim | null {
  let best: { claim: GraphClaim; overlap: number } | null = null;
  for (const claim of corpus) {
    const overlap = tokenOverlap(quote, claim.text);
    if (overlap >= CLAIM_RESTATEMENT_THRESHOLD && (best === null || overlap > best.overlap)) {
      best = { claim, overlap };
    }
  }
  return best?.claim ?? null;
}
