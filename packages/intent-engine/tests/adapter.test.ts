import { describe, expect, it } from "vitest";

import { FetchChatAdapter, LlmError } from "../src/adapter.js";
import type { FetchLike } from "../src/adapter.js";

const OK_BODY = JSON.stringify({
  id: "chatcmpl-1",
  choices: [{ message: { content: "[]" } }],
});

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeFetch(statusResponses: Array<Response | Error>): FetchLike {
  const queue = [...statusResponses];
  return (async () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("fakeFetch ran dry");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as FetchLike;
}

const REQUEST = { system: "s", user: "u" };

describe("FetchChatAdapter", () => {
  it("posts a chat-completions body and returns the message content", async () => {
    let capturedBody: unknown;
    let capturedUrl = "";
    const fetchLike: FetchLike = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse(OK_BODY);
    };
    const adapter = new FetchChatAdapter({
      fetchImpl: fetchLike,
      baseUrl: "https://llm.example.test/v1",
      apiKey: "test-key",
      model: "fixture-model",
    });

    const response = await adapter.complete(REQUEST);

    expect(capturedUrl).toBe("https://llm.example.test/v1/chat/completions");
    expect(response.text).toBe("[]");
    expect(response.model).toBe("fixture-model");
    expect(capturedBody).toMatchObject({
      model: "fixture-model",
      messages: [
        { role: "system", content: "s" },
        { role: "user", content: "u" },
      ],
    });
  });

  it("classifies 429 as retryable rate_limited and 5xx as retryable transport", async () => {
    const adapter = new FetchChatAdapter({
      fetchImpl: fakeFetch([jsonResponse("rate limited", 429)]),
      baseUrl: "https://llm.example.test/v1",
      apiKey: "k",
      model: "m",
    });
    const error = await adapter.complete(REQUEST).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LlmError);
    const llmError = error as LlmError;
    expect(llmError.reason).toBe("rate_limited");
    expect(llmError.retryable).toBe(true);
  });

  it("classifies 401/403 as non-retryable auth", async () => {
    const adapter = new FetchChatAdapter({
      fetchImpl: fakeFetch([jsonResponse("denied", 401)]),
      baseUrl: "https://llm.example.test/v1",
      apiKey: "k",
      model: "m",
    });
    const error = await adapter.complete(REQUEST).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LlmError);
    const llmError = error as LlmError;
    expect(llmError.reason).toBe("auth");
    expect(llmError.retryable).toBe(false);
  });

  it("classifies 400 as non-retryable invalid_response", async () => {
    const adapter = new FetchChatAdapter({
      fetchImpl: fakeFetch([jsonResponse("bad shape", 400)]),
      baseUrl: "https://llm.example.test/v1",
      apiKey: "k",
      model: "m",
    });
    const error = await adapter.complete(REQUEST).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect((error as LlmError).reason).toBe("invalid_response");
    expect((error as LlmError).retryable).toBe(false);
  });

  it("classifies network failures as retryable unreachable", async () => {
    const adapter = new FetchChatAdapter({
      fetchImpl: fakeFetch([new Error("ECONNRESET")]),
      baseUrl: "https://llm.example.test/v1",
      apiKey: "k",
      model: "m",
    });
    const error = await adapter.complete(REQUEST).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect((error as LlmError).reason).toBe("unreachable");
    expect((error as LlmError).retryable).toBe(true);
  });

  it("omits temperature when unset", async () => {
    let capturedBody: unknown;
    const fetchLike: FetchLike = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse(OK_BODY);
    };
    const adapter = new FetchChatAdapter({
      fetchImpl: fetchLike,
      baseUrl: "https://llm.example.test/v1",
      apiKey: "k",
      model: "m",
    });
    await adapter.complete(REQUEST);
    expect(capturedBody).not.toHaveProperty("temperature");
  });
});
