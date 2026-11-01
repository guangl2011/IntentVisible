import type { SentimentFact } from "./types.js";

/**
 * Sentiment Index (Monitor Skill §4): sentiment facts weight +1 (positive
 * statement), 0 (neutral listing), −1 (warning/negative); the mean weight
 * is normalized from −1..1 onto 0..100. With no brand statements the
 * answer says nothing about the brand, and 50 (neutral) is the honest
 * reading rather than a zero.
 */
export const SENTIMENT_NEUTRAL = 50;

/** Mean weighted polarity normalized to 0–100, rounded to 2 decimals. */
export function sentimentIndex(facts: ReadonlyArray<SentimentFact>): number {
  if (facts.length === 0) {
    return SENTIMENT_NEUTRAL;
  }
  const sum = facts.reduce((total, fact) => total + fact.polarity, 0);
  const mean = sum / facts.length; // −1..1
  return round2(((mean + 1) / 2) * 100);
}

/** Round to 2 decimals; keeps percentages stable across aggregation layers. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
