/**
 * YAML round-trip property test (blueprint Verification #7): re-parse the
 * rendered YAML export and assert it reconstructs exactly the same
 * records. The property runs over many generated libs with visibility
 * values swept across the 30%/50% boundaries and hostile strings (colons,
 * quotes, newlines, YAML sigils, unicode) pushed into every free-text
 * field — the YAML layer must be a perfect round-trip for all of them.
 */

import { deepStrictEqual } from "node:assert";
import { describe, expect, it } from "vitest";

import { buildLibExport } from "./build.js";
import { testInput, testLib, type WorldOverrides } from "./fixtures.js";
import { parseYamlExport, renderYamlExport, toYamlView } from "./yaml.js";
import { renderDocumentExport, validateDocumentExport } from "./document.js";
import type { BuyerIntentLib, LibExportInput } from "./types.js";

/** Deterministic PRNG (mulberry32) — property seeds are fixed, never Math.random. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Strings crafted to break YAML emitters: sigils, anchors, quotes, newlines, unicode. */
const HOSTILE_STRINGS = [
  'Quotes: "double" and \'single\'',
  "Colon: followed by text — and an em dash",
  "Line one\nLine two",
  "null",
  "true",
  "42",
  "3.14",
  "*star &anchor #hash",
  "- dash start",
  "  leading spaces",
  "trailing spaces  ",
  "emoji ⚡ café 你好",
  "{} braces and [] brackets",
  "|pipe > greater ? question",
  "",
];

/** Property P1: render∘parse is the identity on the YAML view, for every generated lib. */
function roundTrips(lib: BuyerIntentLib): void {
  const rendered = renderYamlExport(lib);
  const reparsed = parseYamlExport(rendered);
  deepStrictEqual(reparsed, toYamlView(lib));
  // Every rendition of the same lib validates, header included.
  expect(validateDocumentExport(renderDocumentExport(lib)).dataMode).toBe(lib.dataMode);
}

describe("YAML round-trip property", () => {
  it("reconstructs the same records for 200 generated libs", () => {
    const random = mulberry32(0x5eed);
    for (let i = 0; i < 200; i++) {
      // Sweep visibilities across the floor and split boundaries, keeping at
      // least one prompt above the 30% floor so the world is renderable.
      const overrides: WorldOverrides = {
        visibilityCamping: Math.max(random() * 100, 35),
        visibilityCampingSecond: random() * 100,
        visibilitySolar: random() * 100,
      };
      const lib = testLib(overrides);

      // Push hostile strings into every free-text field of the built lib.
      const hostile = HOSTILE_STRINGS[i % HOSTILE_STRINGS.length]!;
      const secondHostile = HOSTILE_STRINGS[(i * 7 + 3) % HOSTILE_STRINGS.length]!;
      for (const intent of lib.intents) {
        for (const prompt of [...intent.revenueExpansion, ...intent.marketExpansion]) {
          prompt.text = `Which option: ${hostile}?`;
          prompt.painPoint = hostile;
          prompt.personaName = secondHostile === "" ? "Weekend Camper" : secondHostile;
          prompt.scenarioContext = hostile;
          prompt.recommendedContent = secondHostile;
          prompt.recommendedCta = hostile;
        }
      }
      roundTrips(lib);
    }
  });

  it("round-trips both measurement-side modes", () => {
    roundTrips(testLib()); // llm_simulated world
    const input = testInput();
    const measuredInput = {
      ...input,
      prompts: input.prompts.map((prompt) => ({ ...prompt, data_mode: "provider_measured" as const })),
      metrics: input.metrics.map((snapshot) => ({
        ...snapshot,
        data_mode: "provider_measured" as const,
      })),
    };
    roundTrips(buildLibExport(measuredInput));
  });

  it("rejects a world where every prompt falls below the floor", () => {
    const input = testInput();
    const allBelowFloor: LibExportInput = {
      ...input,
      metrics: input.metrics.map((snapshot) => ({ ...snapshot, visibility_pct: 12 })),
    };
    expect(() => buildLibExport(allBelowFloor)).toThrowError(/no published metrics/);
  });
});
