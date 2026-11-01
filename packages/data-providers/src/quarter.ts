/**
 * The estimation quarter is part of the determinism contract (blueprint
 * Verification #3): demand tiers are deterministic per (keyword, country,
 * language, quarter), so a new quarter naturally re-estimates while repeat
 * runs inside a quarter never re-bill tokens.
 */

/** UTC quarter stamp for a wall-clock instant, e.g. "2026-Q4". */
export function quarterKey(nowMs: number): string {
  const date = new Date(nowMs);
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}
