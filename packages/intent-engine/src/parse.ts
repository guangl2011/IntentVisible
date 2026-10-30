/**
 * Model output → candidate drafts. The parser is tolerant at the array
 * level (markdown fences, stray prose around the JSON) and strict per
 * candidate: an entry that does not match the draft shape becomes a
 * schema_invalid drop event rather than failing the whole response — one
 * malformed candidate must not discard five good ones.
 */

import { z } from "zod";

import {
  BUYER_STAGES,
  CONFIDENCE_LEVELS,
  INTENT_CATEGORIES,
  MEASUREMENT_STATUSES,
} from "@intentvisible/core-schema";

import type { DropEvent } from "./drops.js";

/**
 * What the model owns. Identity fields (scope, brand_id, country, language)
 * and measured values are deliberately absent — the pipeline injects the
 * former and the latter cannot exist on generated records. Measured fields
 * are still parsed (optionally) so a misbehaving model's output can be
 * rejected with the explicit fabricated_measurement reason instead of a
 * confusing shape error.
 */
export const CandidateIntentSchema = z.strictObject({
  intent_name: z.string().min(1),
  topic: z.string().min(1).optional(),
  buyer_stage: z.enum(BUYER_STAGES),
  intent_category: z.enum(INTENT_CATEGORIES),
  persona: z.string().min(1).optional(),
  pain_point: z.string().min(1).optional(),
  prompts: z.array(z.string().min(1)).min(1),
  recommended_content: z.string().min(1).optional(),
  recommended_cta: z.string().min(1).optional(),
  sku_ids: z.array(z.string().min(1)).optional(),
  evidence_urls: z.array(z.string().min(1)).optional(),
  confidence: z.enum(CONFIDENCE_LEVELS).optional(),
  measurement_status: z.enum(MEASUREMENT_STATUSES).optional(),
  measurement_source: z.string().min(1).nullable().optional(),
  visibility_pct: z.number().nullable().optional(),
  monthly_search_volume: z.number().nullable().optional(),
});

export type CandidateIntent = z.output<typeof CandidateIntentSchema>;

/** The model output could not be read as a candidate array at all. */
export class CandidateParseError extends Error {
  constructor(
    public readonly detail: string,
  ) {
    super(`LLM output is not a candidate array: ${detail}`);
    this.name = "CandidateParseError";
  }
}

/** Extracts the JSON array from model text: optional fences/prose around it. */
function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new CandidateParseError("no JSON array found in the response");
  }
  return body.slice(start, end + 1);
}

function candidateName(entry: unknown): string | undefined {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const name = (entry as { intent_name?: unknown }).intent_name;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

export interface ParsedCandidates {
  candidates: CandidateIntent[];
  /** Entries that failed the draft shape, as validation drop events. */
  dropped: DropEvent[];
}

/**
 * Parses one model completion into candidates. Throws CandidateParseError
 * when the response carries no readable JSON array (the generator treats
 * that as a retryable failure); malformed entries inside a readable array
 * are returned as drop events.
 */
export function parseCandidates(text: string): ParsedCandidates {
  const raw = extractJsonArray(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CandidateParseError(error instanceof Error ? error.message : String(error));
  }
  if (!Array.isArray(parsed)) {
    throw new CandidateParseError("response is not a JSON array");
  }

  const candidates: CandidateIntent[] = [];
  const dropped: DropEvent[] = [];
  for (const [index, entry] of parsed.entries()) {
    const result = CandidateIntentSchema.safeParse(entry);
    if (result.success) {
      candidates.push(result.data);
      continue;
    }
    const issue = result.error.issues[0];
    const where = issue !== undefined ? (issue.path.map(String).join(".") || "root") : "root";
    const why = issue !== undefined ? issue.message : result.error.message;
    dropped.push({
      intent_name: candidateName(entry),
      reason: "schema_invalid",
      detail: `candidate ${index + 1} did not match the draft shape at "${where}": ${why}`,
    });
  }
  return { candidates, dropped };
}
