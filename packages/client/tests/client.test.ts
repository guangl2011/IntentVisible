import { describe, expect, it } from "vitest";

import {
  ConflictError,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  UnexpectedStatusError,
  ValidationError,
  createAgentClient,
  createDashboardClient,
  type FetchLike,
} from "../src/index.js";
import { parseJsonBody, stubFetch } from "./test-doubles.js";

const BASE = "https://iv.example.com";

function makeAgent(
  responses: Array<{ status: number; body?: unknown }>,
  baseUrl: string = BASE,
) {
  const fetchImpl = stubFetch(responses);
  const client = createAgentClient({ baseUrl, apiKey: "iv_agent_key", fetchImpl });
  return { client, fetchImpl };
}

describe("createAgentClient.declareIntent", () => {
  it("sends the declaration to POST /api/intents with the X-API-Key header", async () => {
    const { client, fetchImpl } = makeAgent([
      { status: 201, body: { id: "int_1", status: "PENDING_APPROVAL", verdict: "REQUIRE_APPROVAL", decidedBy: "policy:rule_1" } },
    ]);

    const result = await client.declareIntent({
      actionType: "delete_records",
      riskLevel: "HIGH",
      summary: "Purge stale user rows",
      payload: { table: "users" },
    });

    const call = fetchImpl.calls[0]!;
    expect(call.url).toBe(`${BASE}/api/intents`);
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toMatchObject({
      "content-type": "application/json",
      "x-api-key": "iv_agent_key",
    });
    expect(parseJsonBody(call.init)).toEqual({
      actionType: "delete_records",
      riskLevel: "HIGH",
      summary: "Purge stale user rows",
      payload: { table: "users" },
    });
    expect(result).toEqual({
      id: "int_1",
      status: "PENDING_APPROVAL",
      verdict: "REQUIRE_APPROVAL",
      decidedBy: "policy:rule_1",
    });
  });

  it("normalizes a trailing slash on the base URL", async () => {
    const { client, fetchImpl } = makeAgent([{ status: 201, body: {} }], "https://iv.example.com/");
    await client.declareIntent({ actionType: "deploy", riskLevel: "LOW", summary: "ok" });
    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/api/intents`);
  });

  it("maps 401 to UnauthorizedError", async () => {
    const { client } = makeAgent([{ status: 401, body: { error: "unauthorized" } }]);
    const error = await client
      .declareIntent({ actionType: "deploy", riskLevel: "LOW", summary: "x" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    const httpError = error as UnauthorizedError;
    expect(httpError.status).toBe(401);
    expect(httpError.code).toBe("unauthorized");
  });

  it("maps 422 to ValidationError with normalized issues", async () => {
    const { client } = makeAgent([
      {
        status: 422,
        body: {
          error: "invalid_body",
          issues: [
            { code: "too_small", path: ["actionType"], message: "Too small" },
            { notAnIssue: true },
          ],
        },
      },
    ]);
    const error = (await client
      .declareIntent({ actionType: "", riskLevel: "LOW", summary: "x" })
      .catch((e: unknown) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("invalid_body");
    expect(error.issues).toEqual([{ code: "too_small", path: ["actionType"], message: "Too small" }]);
  });

  it("maps 429 to RateLimitedError", async () => {
    const { client } = makeAgent([{ status: 429, body: { error: "rate_limited" } }]);
    const error = (await client
      .declareIntent({ actionType: "deploy", riskLevel: "LOW", summary: "x" })
      .catch((e: unknown) => e)) as RateLimitedError;
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.code).toBe("rate_limited");
  });
});

describe("createAgentClient.reportOutcome", () => {
  it("URL-encodes the intent id and posts the outcome body", async () => {
    const { client, fetchImpl } = makeAgent([
      { status: 200, body: { id: "int_1", status: "EXECUTED", outcome: "SUCCEEDED", outcomeAt: "2026-10-30T00:00:00.000Z" } },
    ]);

    const result = await client.reportOutcome("int/1", { outcome: "SUCCEEDED" });

    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/api/intents/int%2F1/outcome`);
    expect(parseJsonBody(fetchImpl.calls[0]!.init)).toEqual({ outcome: "SUCCEEDED" });
    expect(result.status).toBe("EXECUTED");
    expect(result.outcome).toBe("SUCCEEDED");
  });

  it("treats a duplicate (first-report-wins) 200 as a normal result", async () => {
    const { client } = makeAgent([
      { status: 200, body: { id: "int_1", status: "FAILED", outcome: "FAILED", outcomeAt: null } },
    ]);
    const result = await client.reportOutcome("int_1", { outcome: "FAILED" });
    expect(result.outcome).toBe("FAILED");
  });

  it("maps 409 to ConflictError carrying the intent's current status", async () => {
    const { client } = makeAgent([
      { status: 409, body: { error: "invalid_state", status: "EXPIRED" } },
    ]);
    const error = (await client
      .reportOutcome("int_1", { outcome: "SUCCEEDED" })
      .catch((e: unknown) => e)) as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.status).toBe(409);
    expect(error.code).toBe("invalid_state");
    expect(error.currentStatus).toBe("EXPIRED");
  });

  it("maps 404 to NotFoundError and 401 (other agent's key) to UnauthorizedError", async () => {
    const notFound = makeAgent([{ status: 404, body: { error: "not_found" } }]);
    const unauthorized = makeAgent([{ status: 401, body: { error: "unauthorized" } }]);
    await expect(
      notFound.client.reportOutcome("int_x", { outcome: "SUCCEEDED" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      unauthorized.client.reportOutcome("int_x", { outcome: "SUCCEEDED" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("error mapping edges", () => {
  it("maps an unlisted status (500) to UnexpectedStatusError", async () => {
    const { client } = makeAgent([{ status: 500, body: { error: "internal_error" } }]);
    const error = (await client
      .declareIntent({ actionType: "deploy", riskLevel: "LOW", summary: "x" })
      .catch((e: unknown) => e)) as UnexpectedStatusError;
    expect(error).toBeInstanceOf(UnexpectedStatusError);
    expect(error.status).toBe(500);
    expect(error.code).toBe("internal_error");
  });

  it("maps a non-JSON error body to the right class with code 'unknown'", async () => {
    const { client } = makeAgent([{ status: 401 }]);
    const error = (await client
      .declareIntent({ actionType: "deploy", riskLevel: "LOW", summary: "x" })
      .catch((e: unknown) => e)) as UnauthorizedError;
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.code).toBe("unknown");
  });

  it("wraps a transport failure in NetworkError", async () => {
    const failing = ((_url: string, _init: RequestInit) =>
      Promise.reject(new TypeError("fetch failed"))) as unknown as FetchLike;
    const client = createAgentClient({ baseUrl: BASE, apiKey: "k", fetchImpl: failing });
    await expect(
      client.declareIntent({ actionType: "deploy", riskLevel: "LOW", summary: "x" }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("createDashboardClient.decide", () => {
  function makeDashboard(responses: Array<{ status: number; body?: unknown }>) {
    const fetchImpl = stubFetch(responses);
    const client = createDashboardClient({
      baseUrl: BASE,
      sessionToken: "a".repeat(64),
      fetchImpl,
    });
    return { client, fetchImpl };
  }

  it("posts APPROVED verdicts to the approve route with the session cookie", async () => {
    const { client, fetchImpl } = makeDashboard([
      { status: 200, body: { id: "int_1", status: "APPROVED", decidedBy: "human:dashboard", decidedAt: "2026-10-30T00:00:00.000Z" } },
    ]);

    const result = await client.decide("int_1", "APPROVED");

    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/api/intents/int_1/approve`);
    expect(fetchImpl.calls[0]!.init.headers).toMatchObject({ cookie: `iv_session=${"a".repeat(64)}` });
    expect(parseJsonBody(fetchImpl.calls[0]!.init)).toEqual({});
    expect(result.status).toBe("APPROVED");
  });

  it("posts DENIED verdicts to the deny route", async () => {
    const { client, fetchImpl } = makeDashboard([
      { status: 200, body: { id: "int_1", status: "DENIED", decidedBy: "human:dashboard", decidedAt: null } },
    ]);
    await client.decide("int_1", "DENIED");
    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/api/intents/int_1/deny`);
  });

  it("maps 409 (already decided) to ConflictError and 401 (bad session) to UnauthorizedError", async () => {
    const decided = makeDashboard([{ status: 409, body: { error: "already_decided" } }]);
    const error = (await decided.client
      .decide("int_1", "APPROVED")
      .catch((e: unknown) => e)) as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("already_decided");
    expect(error.currentStatus).toBeUndefined();

    const badSession = makeDashboard([{ status: 401, body: { error: "unauthorized" } }]);
    await expect(badSession.client.decide("int_1", "APPROVED")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
