import type {
  DecisionResult,
  DecisionVerdict,
  DeclarationResult,
  DeclareIntentRequest,
  OutcomeResult,
  ReportOutcomeRequest,
} from "./types.js";
import { defaultFetch, jsonPostInit, requestJson, type FetchLike } from "./transport.js";

/** Options shared by both client factories. */
interface BaseClientOptions {
  /** IntentVisible deployment root, e.g. "https://iv.example.com". */
  baseUrl: string;
  /** Fetch implementation; defaults to globalThis.fetch. */
  fetchImpl?: FetchLike;
}

export interface AgentClientOptions extends BaseClientOptions {
  /** Raw per-agent API key, sent as the X-API-Key header. */
  apiKey: string;
}

export interface DashboardClientOptions extends BaseClientOptions {
  /**
   * Dashboard session token — the sha256-hex value the iv_session cookie
   * carries (derived from DASHBOARD_PASSCODE), not the passcode itself.
   */
  sessionToken: string;
}

/**
 * Client for agent-side endpoints: declaring intents and reporting outcomes.
 * Each method is a single HTTP call with no state, so retries are the
 * caller's policy — the outcome endpoint is idempotent (first report wins).
 */
export interface AgentClient {
  /**
   * Declare an intent and get the gate verdict. The response carries the
   * decision immediately: APPROVED (auto-approve), PENDING_APPROVAL (held
   * for a human), or DENIED. The agent may execute only from APPROVED.
   */
  declareIntent(request: DeclareIntentRequest): Promise<DeclarationResult>;
  /**
   * Report the executed action's result on an APPROVED intent. First report
   * wins; duplicate reports return the stored result without changing state.
   */
  reportOutcome(intentId: string, request: ReportOutcomeRequest): Promise<OutcomeResult>;
}

/** Client for the human decision endpoints (approve/deny). */
export interface DashboardClient {
  /**
   * Apply a human verdict to a PENDING_APPROVAL intent. A 409 means the
   * intent was already decided — the API's conditional update makes the
   * decision race-safe, and the error carries the current status.
   */
  decide(intentId: string, verdict: DecisionVerdict): Promise<DecisionResult>;
}

/** Normalize a base URL so callers can pass values with or without a trailing slash. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function agentHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey };
}

function dashboardHeaders(sessionToken: string): Record<string, string> {
  // The decision API reads the iv_session cookie, not a header.
  return { cookie: `iv_session=${sessionToken}` };
}

export function createAgentClient(options: AgentClientOptions): AgentClient {
  const { baseUrl, apiKey } = options;
  const fetchImpl = options.fetchImpl ?? defaultFetch();

  return {
    declareIntent(request: DeclareIntentRequest): Promise<DeclarationResult> {
      return requestJson<DeclarationResult>(
        fetchImpl,
        joinUrl(baseUrl, "/api/intents"),
        jsonPostInit(agentHeaders(apiKey), request),
      );
    },

    reportOutcome(intentId: string, request: ReportOutcomeRequest): Promise<OutcomeResult> {
      return requestJson<OutcomeResult>(
        fetchImpl,
        joinUrl(baseUrl, `/api/intents/${encodeURIComponent(intentId)}/outcome`),
        jsonPostInit(agentHeaders(apiKey), request),
      );
    },
  };
}

export function createDashboardClient(options: DashboardClientOptions): DashboardClient {
  const { baseUrl, sessionToken } = options;
  const fetchImpl = options.fetchImpl ?? defaultFetch();

  return {
    decide(intentId: string, verdict: DecisionVerdict): Promise<DecisionResult> {
      const route = verdict === "APPROVED" ? "approve" : "deny";
      return requestJson<DecisionResult>(
        fetchImpl,
        joinUrl(baseUrl, `/api/intents/${encodeURIComponent(intentId)}/${route}`),
        jsonPostInit(dashboardHeaders(sessionToken), {}),
      );
    },
  };
}
