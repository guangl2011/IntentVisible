import { describe, expect, it } from "vitest";

import * as pkg from "./index.js";

describe("intent-engine", () => {
  it("exports its package name", () => {
    expect(pkg.ENGINE_PACKAGE_NAME).toBe("@intentvisible/intent-engine");
  });

  it("exposes the generation surface", () => {
    expect(typeof pkg.IntentGenerator).toBe("function");
    expect(typeof pkg.DeterministicIntentGenerator).toBe("function");
    expect(pkg.DETERMINISTIC_GENERATION_METHOD).toBe("deterministic_extraction");
    expect(typeof pkg.FetchChatAdapter).toBe("function");
    expect(typeof pkg.buildBrandPrompt).toBe("function");
    expect(typeof pkg.buildProductPrompt).toBe("function");
    expect(typeof pkg.intentSystemPrompt).toBe("function");
    expect(typeof pkg.parseCandidates).toBe("function");
    expect(typeof pkg.validateCandidates).toBe("function");
    expect(typeof pkg.validateCandidate).toBe("function");
    expect(typeof pkg.buildStandaloneRecord).toBe("function");
    expect(typeof pkg.slugify).toBe("function");
  });

  it("exposes the typed failure vocabularies", () => {
    expect(pkg.GENERATION_FAILURE_REASONS).toContain("llm_unavailable");
    expect(pkg.VALIDATION_REJECTION_REASONS).toContain("fabricated_measurement");
    expect(pkg.VALIDATION_REJECTION_REASONS).toContain("missing_evidence");
    expect(pkg.VALIDATION_REJECTION_REASONS).toContain("unevidenced_claim");
    expect(pkg.LLM_ERROR_REASONS).toContain("rate_limited");
  });
});
