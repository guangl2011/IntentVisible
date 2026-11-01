import { describe, expect, it } from "vitest";

import { MetricsInputError } from "./errors.js";
import { domainFromUrl, extractCitations, parseAnswer } from "./parse.js";
import type { BrandAliasConfig } from "./types.js";

/** Recorded fixture lexicon: brand Solix vs EcoFlow and Jackery. */
const FIXTURE_LEXICON: BrandAliasConfig = {
  brandId: "brand_solix",
  brandAliases: ["Solix", "S2000"],
  competitors: [
    { id: "brand_ecoflow", aliases: ["EcoFlow", "Delta 2"] },
    { id: "brand_jackery", aliases: ["Jackery", "Explorer 1000"] },
  ],
};

describe("parseAnswer", () => {
  it("extracts recommendations, mentions, citations, and facts from a recorded answer", () => {
    const raw =
      "I recommend the EcoFlow Delta 2 — reliable and efficient. " +
      "Also consider the Jackery Explorer 1000, though it is overpriced. " +
      "Compare: https://rival.example.com/ecoflow-vs-jackery";

    const parsed = parseAnswer(raw, FIXTURE_LEXICON);
    expect(parsed.brand_mentioned).toBe(false);
    expect(parsed.brands_recommended).toEqual(["brand_ecoflow", "brand_jackery"]);
    // prose mentions only — a brand slug inside a cited URL is a citation,
    // not a mention ("EcoFlow" + "Delta 2", "Jackery" + "Explorer 1000")
    expect(parsed.competitor_mentions).toEqual({
      brand_ecoflow: 2,
      brand_jackery: 2,
    });
    expect(parsed.citations).toEqual(["https://rival.example.com/ecoflow-vs-jackery"]);
    expect(parsed.sentiment_facts).toEqual([]);
  });

  it("extracts sentiment facts for every sentence naming the target brand", () => {
    const raw =
      "The Solix S2000 is the best value for camping fridges. " +
      "The Solix S2000 app is buggy. Specs: https://www.example.com/products/s2000";

    const parsed = parseAnswer(raw, FIXTURE_LEXICON);
    expect(parsed.brand_mentioned).toBe(true);
    expect(parsed.brands_recommended).toEqual(["brand_solix"]); // "best value" cue
    expect(parsed.sentiment_facts).toEqual([
      { text: "The Solix S2000 is the best value for camping fridges.", polarity: 1 },
      { text: "The Solix S2000 app is buggy.", polarity: -1 },
    ]);
  });

  it("records a neutral fact when a brand sentence carries no polarity markers", () => {
    const raw = "The Solix S2000 weighs 20 pounds.";
    expect(parseAnswer(raw, FIXTURE_LEXICON).sentiment_facts).toEqual([
      { text: raw, polarity: 0 },
    ]);
  });

  it("matches aliases case-insensitively", () => {
    const parsed = parseAnswer("ECOFLOW delta 2 runs my fridge.", FIXTURE_LEXICON);
    expect(parsed.competitor_mentions).toEqual({ brand_ecoflow: 2, brand_jackery: 0 });
  });

  it("does not match alias substrings inside other words", () => {
    const parsed = parseAnswer("The Solixphere battery is solid.", FIXTURE_LEXICON);
    expect(parsed.brand_mentioned).toBe(false);
    expect(parsed.brands_recommended).toEqual([]);
  });

  it("dedupes citations and strips trailing punctuation", () => {
    const raw =
      "See https://www.example.com/a. Also see https://www.example.com/a and " +
      "https://rival.example.com/b,";
    expect(extractCitations(raw)).toEqual([
      "https://www.example.com/a",
      "https://rival.example.com/b",
    ]);
  });

  it("rejects an empty raw answer", () => {
    expect(() => parseAnswer("   ", FIXTURE_LEXICON)).toThrow(MetricsInputError);
  });

  it("rejects a lexicon with no brand aliases", () => {
    expect(() =>
      parseAnswer("Anything at all.", {
        brandId: "brand_solix",
        brandAliases: [],
        competitors: [],
      }),
    ).toThrow(MetricsInputError);
  });
});

describe("domainFromUrl", () => {
  it("lowercases the host and strips www.", () => {
    expect(domainFromUrl("https://WWW.Example.com/a")).toBe("example.com");
    expect(domainFromUrl("https://rival.example.com/b")).toBe("rival.example.com");
  });

  it("rejects unparsable citations", () => {
    expect(() => domainFromUrl("not a url")).toThrow(MetricsInputError);
  });
});
