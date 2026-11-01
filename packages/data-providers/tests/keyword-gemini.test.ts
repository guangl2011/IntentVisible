/**
 * GeminiKeywordDataProvider default behaviors on recorded fixtures — no
 * live calls: determinism (Verification #3), cache (no re-billed tokens),
 * tier-only output, typed invalid-output failures.
 */

import { describe, expect, it } from "vitest";

import { LlmError } from "@intentvisible/intent-engine";

import {
  DEMAND_ESTIMATION_TEMPERATURE,
  GeminiKeywordDataProvider,
  MAX_KEYWORDS_PER_REQUEST,
  normalizeKeywords,
} from "../src/index.js";
import { FakeClock, ScriptedAdapter } from "./test-doubles.js";
import { InMemoryKeywordVolumeCache } from "../src/cache.js";
import {
  KEYWORD_A,
  KEYWORD_B,
  TIER_RESPONSE_FENCED,
  TIER_RESPONSE_JSON,
} from "./fixtures.js";

function providerWith(
  scripted: Array<string | LlmError>,
  cache?: InMemoryKeywordVolumeCache,
): { provider: GeminiKeywordDataProvider; adapter: ScriptedAdapter } {
  const adapter = new ScriptedAdapter(scripted);
  return { provider: new GeminiKeywordDataProvider({ adapter, clock: new FakeClock(), cache }), adapter };
}

describe("GeminiKeywordDataProvider — determinism (Verification #3)", () => {
  it("replays identical tiers across independent temperature-0 runs", async () => {
    const first = providerWith([TIER_RESPONSE_JSON]);
    const second = providerWith([TIER_RESPONSE_JSON]);

    const a = await first.provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");
    const b = await second.provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");

    expect(a).toEqual(b);
  });

  it("always pins temperature 0 in the fixed estimation prompt", async () => {
    const { provider, adapter } = providerWith([TIER_RESPONSE_JSON]);
    await provider.aiSearchVolume([KEYWORD_A], "US", "en");

    expect(adapter.requests).toHaveLength(1);
    expect(adapter.requests[0]?.temperature).toBe(DEMAND_ESTIMATION_TEMPERATURE);
    expect(adapter.requests[0]?.temperature).toBe(0);
  });

  it("sends the fixed system prompt and the market + quarter material", async () => {
    const { provider, adapter } = providerWith([TIER_RESPONSE_JSON]);
    await provider.aiSearchVolume([KEYWORD_A], "US", "en");

    const request = adapter.requests[0];
    expect(request?.system).toContain("NEVER output a numeric search volume");
    expect(request?.user).toContain("country US");
    expect(request?.user).toContain("language en");
    expect(request?.user).toContain(KEYWORD_A);
  });

  it("tolerates a fenced JSON response and parses the same tiers", async () => {
    const bare = providerWith([TIER_RESPONSE_JSON]);
    const fenced = providerWith([TIER_RESPONSE_FENCED]);

    const a = await bare.provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");
    const b = await fenced.provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");
    expect(b).toEqual(a);
  });
});

describe("GeminiKeywordDataProvider — cache (no re-billed tokens)", () => {
  it("calls the LLM once for a repeat request with the same inputs", async () => {
    const cache = new InMemoryKeywordVolumeCache();
    const first = providerWith([TIER_RESPONSE_JSON], cache);
    const second = providerWith([], cache);

    await first.provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");
    const cached = await second.provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");

    expect(second.adapter.calls).toBe(0);
    expect(cached).toHaveLength(2);
  });

  it("serves cached tiers reordered to the new request order", async () => {
    const cache = new InMemoryKeywordVolumeCache();
    const first = providerWith([TIER_RESPONSE_JSON], cache);
    const second = providerWith([], cache);

    await first.provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");
    const reordered = await second.provider.aiSearchVolume([KEYWORD_B, KEYWORD_A], "US", "en");

    expect(second.adapter.calls).toBe(0);
    expect(reordered.map((volume) => volume.keyword)).toEqual([KEYWORD_B, KEYWORD_A]);
  });

  it("re-estimates when the market changes", async () => {
    const cache = new InMemoryKeywordVolumeCache();
    const first = providerWith([TIER_RESPONSE_JSON, TIER_RESPONSE_JSON], cache);

    await first.provider.aiSearchVolume([KEYWORD_A], "US", "en");
    await first.provider.aiSearchVolume([KEYWORD_A], "DE", "en");

    expect(first.adapter.calls).toBe(2);
  });
});

describe("GeminiKeywordDataProvider — tier-only contract", () => {
  it("never returns a monthly_volume from the LLM path", async () => {
    const { provider } = providerWith([TIER_RESPONSE_JSON]);
    const volumes = await provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en");

    for (const volume of volumes) {
      expect(volume.monthly_volume).toBeNull();
      expect(volume.data_mode).toBe("llm_estimated");
      expect(volume.provenance.source).toBe("gemini-2.5-pro");
      expect(volume.provenance.retrieved_at).toBe(new FakeClock().isoNow());
    }
  });
});

describe("GeminiKeywordDataProvider — typed failures", () => {
  it("fails invalid_response on non-JSON output, without retrying", async () => {
    const { provider, adapter } = providerWith(["I cannot provide market data."]);
    await expect(provider.aiSearchVolume([KEYWORD_A], "US", "en")).rejects.toMatchObject({
      name: "LlmError",
      reason: "invalid_response",
      retryable: false,
    });
    expect(adapter.calls).toBe(1);
  });

  it("fails invalid_response when the model omits a requested keyword", async () => {
    const partial = JSON.stringify({ results: [{ keyword: KEYWORD_A, tier: "high" }] });
    const { provider } = providerWith([partial]);
    await expect(provider.aiSearchVolume([KEYWORD_A, KEYWORD_B], "US", "en")).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });

  it("fails invalid_response when the model invents a volume instead of a tier", async () => {
    const withVolume = JSON.stringify({
      results: [{ keyword: KEYWORD_A, tier: "high", monthly_volume: 12345 }],
    });
    const { provider } = providerWith([withVolume]);
    // Strict parsing rejects the invented measurement rather than carrying it.
    await expect(provider.aiSearchVolume([KEYWORD_A], "US", "en")).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });

  it("retries retryable transport errors within the budget", async () => {
    const { provider, adapter } = providerWith([
      new LlmError("rate_limited", "429", true),
      TIER_RESPONSE_JSON,
    ]);
    const volumes = await provider.aiSearchVolume([KEYWORD_A], "US", "en");
    expect(volumes).toHaveLength(1);
    expect(adapter.calls).toBe(2);
  });
});

describe("input handling", () => {
  it("normalizes case, whitespace, and duplicates", () => {
    expect(normalizeKeywords([`  ${KEYWORD_A.toUpperCase()} `, "", KEYWORD_A, KEYWORD_B])).toEqual([
      KEYWORD_A,
      KEYWORD_B,
    ]);
  });

  it("rejects an empty keyword list", async () => {
    const { provider } = providerWith([]);
    await expect(provider.aiSearchVolume([], "US", "en")).rejects.toBeInstanceOf(TypeError);
  });

  it("rejects oversized batches", async () => {
    const { provider } = providerWith([]);
    const keywords = Array.from({ length: MAX_KEYWORDS_PER_REQUEST + 1 }, (_, i) => `kw ${i}`);
    await expect(provider.aiSearchVolume(keywords, "US", "en")).rejects.toBeInstanceOf(RangeError);
  });
});
