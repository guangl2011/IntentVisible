/**
 * Provider-config tests (fixture-only — no live key, no network).
 *
 * The real key arrives as the runtime secret SECRET_LLM_API_KEY for live
 * runs and dogfooding; these tests inject a throwaway value and assert
 * the resolution and adapter wiring, never any real credential.
 */
import { describe, expect, it } from "vitest";

import { FetchChatAdapter } from "../src/adapter.js";
import { GEMINI_OPENAI_BASE_URL, LLM_API_KEY_ENV, resolveProviderConfig } from "../src/provider-config.js";

const FAKE_KEY = "test-key-not-a-real-credential";

describe("resolveProviderConfig", () => {
  it("resolves the Gemini provider path from the injected env", () => {
    const outcome = resolveProviderConfig({ [LLM_API_KEY_ENV]: FAKE_KEY }, "gemini-test-model");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.config.provider).toBe("gemini");
    expect(outcome.config.baseUrl).toBe(GEMINI_OPENAI_BASE_URL);
    expect(outcome.config.apiKey).toBe(FAKE_KEY);
    expect(outcome.config.model).toBe("gemini-test-model");
  });

  it("fails with a typed reason when the key is missing", () => {
    const outcome = resolveProviderConfig({}, "gemini-test-model");
    expect(outcome).toEqual({ ok: false, reason: "missing_api_key" });
  });

  it("fails with a typed reason when the key is blank", () => {
    const outcome = resolveProviderConfig({ [LLM_API_KEY_ENV]: "   " }, "gemini-test-model");
    expect(outcome).toEqual({ ok: false, reason: "empty_api_key" });
  });
});

describe("resolved config → FetchChatAdapter wiring", () => {
  it("points chat completions at the Gemini OpenAI-compatibility endpoint with bearer auth", async () => {
    const outcome = resolveProviderConfig({ [LLM_API_KEY_ENV]: FAKE_KEY }, "gemini-test-model");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const adapter = new FetchChatAdapter({
      baseUrl: outcome.config.baseUrl,
      apiKey: outcome.config.apiKey,
      model: outcome.config.model,
      fetchImpl: async (url, init) => {
        calls.push({ url, init: init ?? {} });
        return new Response(
          JSON.stringify({
            model: "gemini-test-model",
            choices: [{ message: { content: "[]" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const response = await adapter.complete({
      system: "system",
      user: "user",
      max_output_tokens: 100,
    });
    expect(response.text).toBe("[]");
    expect(response.model).toBe("gemini-test-model");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${GEMINI_OPENAI_BASE_URL}/chat/completions`);
    expect(calls[0]?.init.headers).toEqual(
      expect.objectContaining({ authorization: `Bearer ${FAKE_KEY}` }),
    );
    expect(JSON.parse(String(calls[0]?.init.body)).model).toBe("gemini-test-model");
  });
});
