/**
 * Cache-key contract (blueprint Verification #3): tiers are deterministic
 * per (keyword, country, language, quarter), and the cache key must make
 * exactly that distinction — no more, no less.
 */

import { describe, expect, it } from "vitest";

import { keywordVolumeCacheKey, quarterKey } from "../src/index.js";
import { KEYWORD_A, KEYWORD_B } from "./fixtures.js";

const BASE = {
  keywords: [KEYWORD_A, KEYWORD_B],
  country: "US",
  language: "en",
  quarter: "2026-Q4",
};

describe("keywordVolumeCacheKey", () => {
  it("is identical for identical inputs", () => {
    expect(keywordVolumeCacheKey(BASE)).toBe(keywordVolumeCacheKey({ ...BASE }));
  });

  it("ignores keyword order, case, and surrounding whitespace", () => {
    expect(
      keywordVolumeCacheKey({
        keywords: [`  ${KEYWORD_B.toUpperCase()} `, KEYWORD_A],
        country: "US",
        language: "en",
        quarter: "2026-Q4",
      }),
    ).toBe(keywordVolumeCacheKey(BASE));
  });

  it("deduplicates repeated keywords", () => {
    expect(
      keywordVolumeCacheKey({ ...BASE, keywords: [KEYWORD_A, KEYWORD_A] }),
    ).toBe(keywordVolumeCacheKey({ ...BASE, keywords: [KEYWORD_A] }));
  });

  it("changes when the quarter changes (new quarter re-estimates)", () => {
    expect(keywordVolumeCacheKey({ ...BASE, quarter: "2027-Q1" })).not.toBe(
      keywordVolumeCacheKey(BASE),
    );
  });

  it("changes when the market changes", () => {
    expect(keywordVolumeCacheKey({ ...BASE, country: "DE" })).not.toBe(keywordVolumeCacheKey(BASE));
    expect(keywordVolumeCacheKey({ ...BASE, language: "de" })).not.toBe(keywordVolumeCacheKey(BASE));
  });

  it("changes when the keyword set changes", () => {
    expect(keywordVolumeCacheKey({ ...BASE, keywords: [KEYWORD_A] })).not.toBe(
      keywordVolumeCacheKey(BASE),
    );
  });
});

describe("quarterKey", () => {
  it("maps UTC months to quarters", () => {
    // 2026-01-15T00:00:00Z → Q1; 2026-11-01T00:00:00Z → Q4.
    expect(quarterKey(Date.UTC(2026, 0, 15))).toBe("2026-Q1");
    expect(quarterKey(Date.UTC(2026, 2, 31))).toBe("2026-Q1");
    expect(quarterKey(Date.UTC(2026, 3, 1))).toBe("2026-Q2");
    expect(quarterKey(Date.UTC(2026, 10, 1))).toBe("2026-Q4");
  });
});
