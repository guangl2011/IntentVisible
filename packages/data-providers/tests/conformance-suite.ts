/**
 * The implementation-agnostic conformance contract (blueprint Verification
 * #11): every KeywordDataProvider and every MonitoringRunner — the LLM
 * defaults here, a fixture today, DataForSEO/Visible/native APIs later —
 * must pass the SAME suites. Any impl that can't, can't be swapped in
 * without touching callers.
 */

import { expect, it, describe } from "vitest";

import { DemandEstimateSchema } from "@intentvisible/core-schema";

import type { KeywordDataProvider, KeywordVolume } from "../src/keywords.js";
import type { MonitoringRunner } from "../src/monitoring.js";
import { KEYWORD_A, KEYWORD_B } from "./fixtures.js";

/** The keywords every conformance run requests, in a fixed order. */
const CONFORMANCE_KEYWORDS = [KEYWORD_A, KEYWORD_B];

export function keywordProviderConformance(
  name: string,
  makeProvider: () => KeywordDataProvider,
): void {
  describe(`KeywordDataProvider conformance — ${name}`, () => {
    it("returns one entry per requested keyword, in request order", async () => {
      const volumes = await makeProvider().aiSearchVolume([...CONFORMANCE_KEYWORDS], "US", "en");
      expect(volumes.map((volume) => volume.keyword)).toEqual(CONFORMANCE_KEYWORDS);
    });

    it("emits core-schema-valid KeywordVolume records", async () => {
      const volumes = await makeProvider().aiSearchVolume([...CONFORMANCE_KEYWORDS], "US", "en");
      for (const volume of volumes) {
        expect(DemandEstimateSchema.parse(volume)).toEqual(volume);
      }
    });

    it("never presents a numeric volume where only an estimate exists", async () => {
      const volumes: KeywordVolume[] = await makeProvider().aiSearchVolume(
        [...CONFORMANCE_KEYWORDS],
        "US",
        "en",
      );
      for (const volume of volumes) {
        if (volume.data_mode === "llm_estimated") {
          expect(volume.monthly_volume).toBeNull();
        }
      }
    });

    it("carries provenance on every entry", async () => {
      const volumes = await makeProvider().aiSearchVolume([...CONFORMANCE_KEYWORDS], "US", "en");
      for (const volume of volumes) {
        expect(volume.provenance.source).not.toBe("");
        expect(() => new Date(volume.provenance.retrieved_at).toISOString()).not.toThrow();
      }
    });
  });
}

export function monitoringRunnerConformance(name: string, makeRunner: () => MonitoringRunner): void {
  describe(`MonitoringRunner conformance — ${name}`, () => {
    it("exposes a valid platform and a coherent data_mode", () => {
      const runner = makeRunner();
      expect(["chatgpt_search", "perplexity", "google_ai_overviews", "gemini"]).toContain(
        runner.platform,
      );
      expect(["llm_simulated", "provider_measured"]).toContain(runner.data_mode);
    });

    it("runs one prompt and returns a raw answer snapshot", async () => {
      const result = await makeRunner().run(
        "which portable power station should I buy for camping?",
        "US",
        "en",
      );
      expect(result.raw_answer.length).toBeGreaterThan(0);
    });

    it("records model_id and an ISO ran_at on every run", async () => {
      const result = await makeRunner().run(
        "which portable power station should I buy for camping?",
        "US",
        "en",
      );
      expect(result.model_id).not.toBe("");
      expect(new Date(result.ran_at).toISOString()).toBe(new Date(result.ran_at).toISOString());
    });

    it("returns a unique citation list (possibly empty)", async () => {
      const result = await makeRunner().run(
        "which portable power station should I buy for camping?",
        "US",
        "en",
      );
      expect(new Set(result.citations).size).toBe(result.citations.length);
    });
  });
}
