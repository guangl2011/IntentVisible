/**
 * Provider-agnostic LLM adapter (spec architecture decisions: no SDK lock-in
 * in engine code). The generator depends only on the LlmAdapter interface;
 * FetchChatAdapter is a reference driver speaking the OpenAI-compatible
 * chat-completions wire format over plain fetch, so any provider exposing
 * that shape works without an SDK dependency.
 */

/** Transport signature the adapter needs; injectable for tests. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface LlmRequest {
  /** System prompt: the pipeline's standing instructions. */
  system: string;
  /** User prompt: the evidence and market for one generation call. */
  user: string;
  temperature?: number;
  max_output_tokens?: number;
}

export interface LlmResponse {
  /** Raw completion text — the generator parses candidates out of this. */
  text: string;
  /** Model identifier as reported by the provider (stored in records). */
  model: string;
}

export const LLM_ERROR_REASONS = [
  "auth",
  "rate_limited",
  "unreachable",
  "invalid_response",
] as const;
export type LlmErrorReason = (typeof LLM_ERROR_REASONS)[number];

/**
 * Typed adapter failure. `retryable` drives the generator's backoff budget:
 * retryable errors are retried until the budget is spent, non-retryable
 * errors fail the generation deterministically on the first attempt.
 */
export class LlmError extends Error {
  constructor(
    public readonly reason: LlmErrorReason,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmAdapter {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export interface FetchChatAdapterOptions {
  /** Chat-completions base URL, e.g. https://api.example.com/v1 */
  baseUrl: string;
  /** Runtime secret — supplied per environment, never committed (spec guardrail). */
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface ChatCompletionWireResponse {
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } } | undefined>;
}

export class FetchChatAdapter implements LlmAdapter {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: FetchChatAdapterOptions) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const url = `${this.options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.max_output_tokens !== undefined
            ? { max_tokens: request.max_output_tokens }
            : {}),
        }),
        ...(this.options.timeoutMs !== undefined
          ? { signal: AbortSignal.timeout(this.options.timeoutMs) }
          : {}),
      });
    } catch (error) {
      throw new LlmError(
        "unreachable",
        `LLM request failed before a response was returned: ${
          error instanceof Error ? error.message : String(error)
        }`,
        true,
      );
    }

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "");
      throw new LlmError(
        "rate_limited",
        "LLM API rate limit hit (HTTP 429)",
        true,
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : undefined,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new LlmError(
        "auth",
        `LLM API rejected the credentials (HTTP ${response.status})`,
        false,
      );
    }
    if (!response.ok) {
      // 5xx is the provider's problem and usually transient; other client
      // errors (4xx) mean the request itself is wrong and retrying is waste.
      const retryable = response.status >= 500;
      throw new LlmError(
        retryable ? "unreachable" : "invalid_response",
        `LLM API returned HTTP ${response.status}`,
        retryable,
      );
    }

    let wire: ChatCompletionWireResponse;
    try {
      wire = (await response.json()) as ChatCompletionWireResponse;
    } catch (error) {
      throw new LlmError(
        "invalid_response",
        `LLM response body was not JSON: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
    const choice = wire.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new LlmError("invalid_response", "LLM response carried no message content", true);
    }
    const model =
      typeof wire.model === "string" && wire.model.length > 0 ? wire.model : this.options.model;
    return { text: content, model };
  }
}
