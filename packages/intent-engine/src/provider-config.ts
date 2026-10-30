/**
 * Live-run provider config (spec: provider-agnostic adapter, no SDK lock-in).
 *
 * The confirmed live provider is Google Gemini; its key is injected as the
 * runtime secret `SECRET_LLM_API_KEY` and must never be committed, logged,
 * or echoed. Fixture tests never touch this module — they script
 * `LlmAdapter` doubles instead. The wire protocol stays OpenAI-style chat
 * completions, which Gemini's documented OpenAI-compatibility endpoint
 * speaks, so `FetchChatAdapter` serves both without a second protocol.
 */

export const LLM_API_KEY_ENV = "SECRET_LLM_API_KEY";

/** Gemini's OpenAI-compatibility base (chat completions at `/chat/completions`). */
export const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export type ResolvedProviderConfig = {
  provider: "gemini";
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ProviderConfigOutcome =
  | { ok: true; config: ResolvedProviderConfig }
  | { ok: false; reason: "missing_api_key" | "empty_api_key" };

/**
 * Resolves the Gemini provider path from the environment. The model is a
 * required argument — callers pick the deployment, this module never
 * defaults one. The key value is carried, never surfaced in errors.
 */
export function resolveProviderConfig(
  env: Record<string, string | undefined>,
  model: string,
): ProviderConfigOutcome {
  const apiKey = env[LLM_API_KEY_ENV];
  if (apiKey === undefined) {
    return { ok: false, reason: "missing_api_key" };
  }
  if (apiKey.trim() === "") {
    return { ok: false, reason: "empty_api_key" };
  }
  return {
    ok: true,
    config: { provider: "gemini", baseUrl: GEMINI_OPENAI_BASE_URL, apiKey, model },
  };
}
