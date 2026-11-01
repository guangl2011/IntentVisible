import type { BrandAliasConfig, BrandId, ParsedAnswer, SentimentFact } from "./types.js";
import { MetricsInputError } from "./errors.js";

/**
 * Deterministic, lexicon-based answer parser (blueprint Stage C.2): a raw
 * simulated/measured answer becomes { brand mention, recommendations,
 * competitor mentions, citations, sentiment facts } with no LLM in the
 * loop — parsed fields must be reproducible from the raw snapshot
 * (run & parse integrity family).
 */

/** Phrases that mark a sentence as actively recommending a named brand. */
const RECOMMENDATION_CUES = [
  "recommend",
  "recommends",
  "recommended",
  "top pick",
  "top choice",
  "my pick",
  "best pick",
  "best value",
  "go with",
  "worth buying",
  "choose",
  "consider",
  "start with",
  "solid choice",
  "great option",
  "standout",
  "first choice",
  "safest bet",
];

/** Positive statement markers (+1 in the Monitor Skill's sentiment model). */
const POSITIVE_MARKERS = [
  "recommend",
  "excellent",
  "best",
  "reliable",
  "dependable",
  "effective",
  "worth it",
  "great",
  "solid",
  "impressive",
  "trusted",
  "leader",
  "efficient",
  "good value",
  "premium",
];

/** Negative/warning markers (−1 in the Monitor Skill's sentiment model). */
const NEGATIVE_MARKERS = [
  "avoid",
  "caution",
  "warning",
  "side effect",
  "side effects",
  "overpriced",
  "not worth",
  "underwhelming",
  "unreliable",
  "buggy",
  "poor",
  "complaints",
  "risky",
  "refund",
  "disappointed",
];

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

/** Split into sentences on sentence-final punctuation followed by whitespace. */
function sentencesOf(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Prose form of a sentence: citation URLs removed. A brand slug inside a
 * cited URL is a citation, not a prose mention, and must not count toward
 * mentions or sentiment.
 */
function proseOf(sentence: string): string {
  return sentence.replace(URL_PATTERN, " ");
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive matcher for one entity's alias set. */
function aliasMatcher(aliases: string[]): RegExp | null {
  const patterns = aliases.map(escapeRegExp).filter((alias) => alias.length > 0);
  if (patterns.length === 0) {
    return null;
  }
  return new RegExp(`\\b(?:${patterns.join("|")})\\b`, "gi");
}

function countMatches(text: string, matcher: RegExp): number {
  return [...text.matchAll(matcher)].length;
}

/** Extract, dedupe, and lightly clean the URLs an answer cites. */
export function extractCitations(answer: string): string[] {
  const seen = new Set<string>();
  const citations: string[] = [];
  for (const raw of answer.match(URL_PATTERN) ?? []) {
    const url = raw.replace(/[.,;:)\]]+$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      citations.push(url);
    }
  }
  return citations;
}

/** Registrable domain of a citation URL (lowercased, www. stripped). */
export function domainFromUrl(url: string): string {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new MetricsInputError(`citation is not a parsable URL: ${url}`);
  }
  const domain = hostname.toLowerCase().replace(/^www\./, "");
  if (domain.length === 0) {
    throw new MetricsInputError(`citation URL has no hostname: ${url}`);
  }
  return domain;
}

/** Whether a sentence actively recommends a brand it names. */
function isRecommendation(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return RECOMMENDATION_CUES.some((cue) => lower.includes(cue));
}

/** Polarity of one brand-mentioning sentence: positive beats negative counts. */
function polarityOf(sentence: string): SentimentFact["polarity"] {
  const lower = sentence.toLowerCase();
  const positives = POSITIVE_MARKERS.filter((marker) => lower.includes(marker)).length;
  const negatives = NEGATIVE_MARKERS.filter((marker) => lower.includes(marker)).length;
  if (positives > negatives) return 1;
  if (negatives > positives) return -1;
  return 0;
}

/**
 * Parse one raw answer against the brand/competitor lexicon. Pure and
 * deterministic: the same raw answer and lexicon always produce the same
 * parse, so parsed fields stay reproducible from the stored snapshot.
 */
export function parseAnswer(rawAnswer: string, config: BrandAliasConfig): ParsedAnswer {
  if (rawAnswer.trim().length === 0) {
    throw new MetricsInputError("raw answer is empty; snapshots are immutable and never blank");
  }

  const sentences = sentencesOf(rawAnswer);

  const brandMatcher = aliasMatcher(config.brandAliases);
  if (!brandMatcher) {
    throw new MetricsInputError(`brand ${config.brandId} has no aliases to match against`);
  }
  const prose = sentences.map(proseOf);
  const brandMentioned = prose.some((sentence) => countMatches(sentence, brandMatcher) > 0);

  const competitorMatchers = new Map<string, RegExp>();
  for (const competitor of config.competitors) {
    const matcher = aliasMatcher(competitor.aliases);
    if (!matcher) {
      throw new MetricsInputError(`competitor ${competitor.id} has no aliases to match against`);
    }
    competitorMatchers.set(competitor.id, matcher);
  }

  const competitorMentions: Record<string, number> = {};
  for (const [id, matcher] of competitorMatchers) {
    competitorMentions[id] = prose.reduce(
      (count, sentence) => count + countMatches(sentence, matcher),
      0,
    );
  }

  const recommended = new Set<BrandId>();
  const sentimentFacts: SentimentFact[] = [];
  for (const [index, sentence] of prose.entries()) {
    if (isRecommendation(sentence)) {
      if (countMatches(sentence, brandMatcher) > 0) {
        recommended.add(config.brandId);
      }
      for (const [id, matcher] of competitorMatchers) {
        if (countMatches(sentence, matcher) > 0) {
          recommended.add(id);
        }
      }
    }
    if (countMatches(sentence, brandMatcher) > 0) {
      sentimentFacts.push({ text: sentences[index] ?? sentence, polarity: polarityOf(sentence) });
    }
  }

  return {
    brand_mentioned: brandMentioned,
    brands_recommended: [...recommended],
    competitor_mentions: competitorMentions,
    citations: extractCitations(rawAnswer),
    sentiment_facts: sentimentFacts,
  };
}
