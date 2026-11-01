/**
 * Shared types for parsing and metric computation. The parser output
 * shape follows blueprint Stage C.2: target-brand mention, brand/competitor
 * recommendations, competitor mentions, cited domains, and sentiment facts.
 */

export type BrandId = string;

/** One sentiment statement about the target brand (Monitor Skill §4). */
export interface SentimentFact {
  /** The verbatim sentence the polarity was extracted from. */
  text: string;
  /** +1 positive statement, 0 neutral listing, −1 warning or negative. */
  polarity: -1 | 0 | 1;
}

/** Deterministic parse of one raw monitoring answer. */
export interface ParsedAnswer {
  /** Target brand appears anywhere in the answer (visibility input). */
  brand_mentioned: boolean;
  /** Brand ids (target or competitors) the answer actively recommends. */
  brands_recommended: BrandId[];
  /** Competitor id → number of alias occurrences in the answer. */
  competitor_mentions: Record<BrandId, number>;
  /** URLs cited by the answer, deduplicated, in first-seen order. */
  citations: string[];
  /** Sentiment statements about the target brand, in sentence order. */
  sentiment_facts: SentimentFact[];
}

/** Entity lexicon the parser matches against a raw answer. */
export interface BrandAliasConfig {
  brandId: BrandId;
  /** Aliases that count as a mention of the target brand. */
  brandAliases: string[];
  /** Monitored competitors and the aliases that count as their mention. */
  competitors: ReadonlyArray<{ id: BrandId; aliases: string[] }>;
}
