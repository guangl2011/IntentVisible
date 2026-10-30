import type { IntentStatus } from "./types.js";

/**
 * Typed error hierarchy for the IntentVisible API. Every non-2xx response the
 * merged routes can produce maps to one subclass; unknown statuses stay
 * typed too, so callers can always branch on class and read `status`/`code`.
 */

/** Structural shape of a zod issue as the API serializes it in 422 bodies. */
export interface ValidationIssue {
  path: string[];
  message: string;
  code?: string;
}

export abstract class IntentVisibleError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/** Base for every error produced by an HTTP response. */
export abstract class IntentVisibleHttpError extends IntentVisibleError {
  readonly status: number;
  /** The API's `error` body field, or "unknown" when the body was not JSON. */
  readonly code: string;
  /** The parsed response body, for callers that need more than the class. */
  readonly body: unknown;

  constructor(status: number, code: string, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** 401 — missing/unknown/inactive agent key, or an unauthenticated dashboard session. */
export class UnauthorizedError extends IntentVisibleHttpError {}

/** 404 — the intent id does not exist. */
export class NotFoundError extends IntentVisibleHttpError {}

/**
 * 409 — the intent was already decided or moved past the state the call
 * required. `currentStatus` carries the API's report of where the intent
 * actually is, when the response body included it.
 */
export class ConflictError extends IntentVisibleHttpError {
  readonly currentStatus?: IntentStatus;

  constructor(
    status: number,
    code: string,
    body: unknown,
    message: string,
    currentStatus?: IntentStatus,
  ) {
    super(status, code, body, message);
    this.currentStatus = currentStatus;
  }
}

/** 422 — the request body failed the API's zod validation. */
export class ValidationError extends IntentVisibleHttpError {
  readonly issues: ValidationIssue[];

  constructor(
    status: number,
    code: string,
    body: unknown,
    message: string,
    issues: ValidationIssue[],
  ) {
    super(status, code, body, message);
    this.issues = issues;
  }
}

/** 429 — the per-key rate limit was hit; back off and retry later. */
export class RateLimitedError extends IntentVisibleHttpError {}

/** Any other non-2xx status the current API version can return (e.g. 5xx). */
export class UnexpectedStatusError extends IntentVisibleHttpError {}

/** The fetch itself failed (connection refused, DNS, aborted) before a response existed. */
export class NetworkError extends IntentVisibleError {
  constructor(
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
