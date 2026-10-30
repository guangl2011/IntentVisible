import {
  ConflictError,
  NetworkError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  UnexpectedStatusError,
  ValidationError,
  IntentVisibleHttpError,
  type ValidationIssue,
} from "./errors.js";
import type { IntentStatus } from "./types.js";

/**
 * Minimal structural fetch so the client runs anywhere fetch exists (Node 18+,
 * browsers, edge runtimes) and tests can stub it without patching globals.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function defaultFetch(): FetchLike {
  const impl = globalThis.fetch;
  if (!impl) {
    throw new Error(
      "No global fetch found; pass a fetchImpl to the client factory for this runtime.",
    );
  }
  return impl.bind(globalThis) as FetchLike;
}

/** Extract the API's `error` body field defensively, whatever the body is. */
function errorCode(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const value = (body as Record<string, unknown>)["error"];
    if (typeof value === "string") return value;
  }
  return "unknown";
}

/** Normalize the API's zod `issues` array into the client's ValidationIssue shape. */
function normalizeIssues(body: unknown): ValidationIssue[] {
  if (typeof body !== "object" || body === null || !("issues" in body)) return [];
  const raw = (body as Record<string, unknown>)["issues"];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((issue): ValidationIssue[] => {
    if (typeof issue !== "object" || issue === null) return [];
    const record = issue as Record<string, unknown>;
    // Drop entries the API did not shape as a zod issue rather than
    // inventing a placeholder the caller could mistake for a real one.
    if (typeof record["message"] !== "string") return [];
    const path = Array.isArray(record["path"])
      ? record["path"].filter((part): part is string => typeof part === "string")
      : [];
    const code = typeof record["code"] === "string" ? record["code"] : undefined;
    return [{ path, message: record["message"], code }];
  });
}

/**
 * Pure response → error mapping, keyed on HTTP status first (the contract the
 * routes guarantee) with the body's error string carried as `code`. A
 * non-JSON error body still lands on the right class.
 */
export function errorFromResponse(status: number, body: unknown): IntentVisibleHttpError {
  const code = errorCode(body);
  switch (status) {
    case 401:
      return new UnauthorizedError(
        status,
        code,
        body,
        "IntentVisible request was not authorized (check the API key or dashboard session).",
      );
    case 404:
      return new NotFoundError(status, code, body, "IntentVisible intent not found.");
    case 409: {
      const bodyStatus =
        typeof body === "object" && body !== null && "status" in body
          ? (body as Record<string, unknown>)["status"]
          : undefined;
      const currentStatus =
        typeof bodyStatus === "string" ? (bodyStatus as IntentStatus) : undefined;
      return new ConflictError(
        status,
        code,
        body,
        `IntentVisible intent is in a conflicting state${currentStatus ? ` (${currentStatus})` : ""}.`,
        currentStatus,
      );
    }
    case 422: {
      const issues = normalizeIssues(body);
      return new ValidationError(
        status,
        code,
        body,
        `IntentVisible request body was rejected: ${issues.map((i) => i.message).join("; ") || code}.`,
        issues,
      );
    }
    case 429:
      return new RateLimitedError(
        status,
        code,
        body,
        "IntentVisible rate limit exceeded; retry later.",
      );
    default:
      return new UnexpectedStatusError(
        status,
        code,
        body,
        `IntentVisible API returned an unexpected status ${status}.`,
      );
  }
}

async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Issue one request and resolve with the parsed 2xx body, or a typed error. */
export async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    if (error instanceof IntentVisibleHttpError || error instanceof NetworkError) throw error;
    throw new NetworkError(
      `IntentVisible request to ${url} failed before a response arrived.`,
      { cause: error },
    );
  }

  const body = await parseBody(response);
  if (!response.ok) {
    throw errorFromResponse(response.status, body);
  }
  return body as T;
}

/** JSON POST init shared by every call the client makes. */
export function jsonPostInit(headers: Record<string, string>, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}
