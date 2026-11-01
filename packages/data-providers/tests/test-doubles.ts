/**
 * Test doubles: scripted LLM adapters (recorded-response semantics), a
 * controllable clock, and fixture provider/runner implementations of the
 * RESERVED interfaces — the swappability proof (Verification #11): these
 * pass the same conformance suites the LLM defaults pass.
 */

import type { Platform, RunDataMode } from "@intentvisible/core-schema";
import { LlmError, type Clock, type LlmAdapter, type LlmRequest, type LlmResponse } from "@intentvisible/intent-engine";

import type { CountryCode, KeywordDataProvider, KeywordVolume, LanguageCode } from "../src/keywords.js";
import type { MonitoringRunner, RunResult } from "../src/monitoring.js";

export class FakeClock implements Clock {
  #now = 1_793_548_800_000; // fixed 2026 epoch ms — deterministic timestamps

  nowMs(): number {
    return this.#now;
  }

  isoNow(): string {
    return new Date(this.#now).toISOString();
  }

  async sleep(_ms: number): Promise<void> {
    void _ms;
  }
}

/** Serves a scripted queue of model texts (or throws) in call order. */
export class ScriptedAdapter implements LlmAdapter {
  readonly requests: LlmRequest[] = [];
  calls = 0;

  constructor(private readonly scripted: Array<string | LlmError>) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    const next = this.scripted.shift();
    if (next === undefined) {
      throw new Error("ScriptedAdapter ran dry — more complete() calls than scripted responses");
    }
    this.requests.push(request);
    if (next instanceof LlmError) {
      throw next;
    }
    return { text: next, model: "gemini-2.5-pro" };
  }
}

/**
 * Fixture KeywordDataProvider — the "advanced tier" stand-in. Entries are
 * handed in verbatim, so the same class can play llm_estimated (tier-only)
 * or provider_measured (volume-filled) mode.
 */
export class FixtureKeywordDataProvider implements KeywordDataProvider {
  constructor(private readonly entries: readonly KeywordVolume[]) {}

  async aiSearchVolume(
    keywords: string[],
    _country: CountryCode,
    _language: LanguageCode,
  ): Promise<KeywordVolume[]> {
    void _country;
    void _language;
    return keywords.map((keyword) => {
      const entry = this.entries.find((candidate) => candidate.keyword === keyword.trim().toLowerCase());
      if (entry === undefined) {
        throw new Error(`FixtureKeywordDataProvider has no entry for "${keyword}"`);
      }
      return entry;
    });
  }
}

/**
 * Fixture MonitoringRunner — serves a canned recorded answer. Defaults to
 * provider_measured so an "advanced provider" run of the conformance suite
 * is exercised; constructor accepts the simulated mode too.
 */
export class FixtureMonitoringRunner implements MonitoringRunner {
  readonly platform: Platform;
  readonly data_mode: RunDataMode;

  constructor(
    platform: Platform,
    data_mode: RunDataMode,
    private readonly answer: Omit<RunResult, "ran_at">,
  ) {
    this.platform = platform;
    this.data_mode = data_mode;
  }

  async run(_prompt: string, _country: CountryCode, _language: LanguageCode): Promise<RunResult> {
    void _prompt;
    void _country;
    void _language;
    return { ...this.answer, ran_at: "2026-11-01T00:00:00.000Z" };
  }
}
