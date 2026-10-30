/**
 * Validation stage (spec Flow, Validate + dedup row): drops candidates
 * without evidence URLs, with fabricated measurement fields, or claiming
 * evidence or SKUs the profiles never supplied. Dropped candidates are
 * logged as drop events and never stored.
 *
 * "Unevidenced product claims" is enforced in the mechanically checkable
 * form: every citation and every SKU reference must come from the supplied
 * evidence. Textual claims inside prompts are constrained at generation
 * time by the system prompt's evidence-first rule; mechanical entailment of
 * free text is not attempted here.
 */

import type { CandidateIntent } from "./parse.js";
import type { DropEvent, ValidationRejectionReason } from "./drops.js";

export interface ValidationContext {
  scope: "brand" | "product";
  brand_id: string;
  country: string;
  language: string;
  /** The only evidence URLs a candidate may cite (the stored snapshot registry). */
  allowed_evidence_urls: readonly string[];
  /** The only SKU ids a candidate may reference (empty for brand scope). */
  allowed_sku_ids: readonly string[];
  /** Model identifier recorded on records built from accepted drafts. */
  generation_model: string;
}

/**
 * A validated candidate with pipeline-owned identity fields injected.
 * Measurement fields are absent by construction — the record builder is
 * the only place they exist, and it hard-sets the standalone nulls.
 */
export interface ValidatedDraft {
  scope: "brand" | "product";
  brand_id: string;
  country: string;
  language: string;
  intent_name: string;
  topic: string | undefined;
  buyer_stage: CandidateIntent["buyer_stage"];
  intent_category: CandidateIntent["intent_category"];
  persona: string | undefined;
  pain_point: string | undefined;
  prompts: string[];
  recommended_content: string | undefined;
  recommended_cta: string | undefined;
  sku_ids: string[];
  evidence_urls: string[];
  confidence: CandidateIntent["confidence"];
  generation_model: string;
}

export type ValidationOutcome =
  | { ok: true; draft: ValidatedDraft }
  | { ok: false; event: DropEvent };

function drop(
  candidate: CandidateIntent,
  reason: ValidationRejectionReason,
  detail: string,
): { ok: false; event: DropEvent } {
  return { ok: false, event: { intent_name: candidate.intent_name, reason, detail } };
}

/** Validates one candidate against the run's evidence registry and identity inputs. */
export function validateCandidate(
  candidate: CandidateIntent,
  context: ValidationContext,
): ValidationOutcome {
  // Fabricated measurement: the generator constructs only not_measured
  // records, so any measured value on a candidate is model fabrication.
  if (
    candidate.measurement_status !== undefined &&
    candidate.measurement_status !== "not_measured"
  ) {
    return drop(
      candidate,
      "fabricated_measurement",
      `candidate declared measurement_status "${candidate.measurement_status}" — standalone generation cannot classify measurements`,
    );
  }
  const measuredFields = [
    ["measurement_source", candidate.measurement_source],
    ["visibility_pct", candidate.visibility_pct],
    ["monthly_search_volume", candidate.monthly_search_volume],
  ] as const;
  for (const [field, value] of measuredFields) {
    if (value !== undefined && value !== null) {
      return drop(
        candidate,
        "fabricated_measurement",
        `candidate set ${field}=${String(value)} — the generator has no code path for measured values`,
      );
    }
  }

  const evidenceUrls = candidate.evidence_urls ?? [];
  if (evidenceUrls.length === 0) {
    return drop(candidate, "missing_evidence", "candidate carried no evidence_urls");
  }
  const allowedUrls = new Set(context.allowed_evidence_urls);
  const unknownUrls = evidenceUrls.filter((url) => !allowedUrls.has(url));
  if (unknownUrls.length > 0) {
    return drop(
      candidate,
      "unevidenced_claim",
      `candidate cites URLs outside the supplied evidence registry: ${unknownUrls.join(", ")}`,
    );
  }

  const skuIds = candidate.sku_ids ?? [];
  const allowedSkus = new Set(context.allowed_sku_ids);
  const unknownSkus = skuIds.filter((sku) => !allowedSkus.has(sku));
  if (unknownSkus.length > 0) {
    return drop(
      candidate,
      "unevidenced_claim",
      `candidate references SKUs the profile does not evidence: ${unknownSkus.join(", ")}`,
    );
  }

  return {
    ok: true,
    draft: {
      scope: context.scope,
      brand_id: context.brand_id,
      country: context.country,
      language: context.language,
      intent_name: candidate.intent_name,
      topic: candidate.topic,
      buyer_stage: candidate.buyer_stage,
      intent_category: candidate.intent_category,
      persona: candidate.persona,
      pain_point: candidate.pain_point,
      prompts: [...candidate.prompts],
      recommended_content: candidate.recommended_content,
      recommended_cta: candidate.recommended_cta,
      sku_ids: [...skuIds],
      evidence_urls: [...evidenceUrls],
      confidence: candidate.confidence ?? "low",
      generation_model: context.generation_model,
    },
  };
}

export interface ValidationSummary {
  accepted: ValidatedDraft[];
  dropped: DropEvent[];
}

/** Validates a candidate list, keeping accepted drafts in input order. */
export function validateCandidates(
  candidates: readonly CandidateIntent[],
  context: ValidationContext,
): ValidationSummary {
  const accepted: ValidatedDraft[] = [];
  const dropped: DropEvent[] = [];
  for (const candidate of candidates) {
    const outcome = validateCandidate(candidate, context);
    if (outcome.ok) {
      accepted.push(outcome.draft);
    } else {
      dropped.push(outcome.event);
    }
  }
  return { accepted, dropped };
}
