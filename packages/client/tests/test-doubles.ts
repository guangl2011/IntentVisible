import type { FetchLike } from "../src/index.js";

/**
 * These are pure unit tests: the transport is stubbed, so no live DB, no
 * server, and no network are involved. The anti-race and idempotency
 * semantics the API guarantees live in SQL and are covered by apps/web's
 * DB-backed route tests; here we lock the wire contract the client sends
 * and the typed error mapping for the statuses the routes can return.
 */

export interface RecordedCall {
  url: string;
  init: RequestInit;
}

export type FetchStub = FetchLike & {
  readonly calls: readonly RecordedCall[];
};

/**
 * A fetch double that records every call and replies from a queue of
 * canned responses; the last response repeats once the queue is drained.
 */
export function stubFetch(
  responses: Array<{ status: number; body?: unknown }>,
  reply?: (call: RecordedCall, index: number) => Response,
): FetchStub {
  const calls: RecordedCall[] = [];
  const stub = (async (url: string, init: RequestInit) => {
    const call: RecordedCall = { url, init };
    calls.push(call);
    if (reply) return reply(call, calls.length - 1);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return jsonResponse(next.status, next.body);
  }) as unknown as FetchStub;
  Object.defineProperty(stub, "calls", { get: () => calls.slice() });
  return stub;
}

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? "not json" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function parseJsonBody(init: RequestInit): unknown {
  return JSON.parse(String(init.body));
}
