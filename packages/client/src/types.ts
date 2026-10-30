/**
 * Wire contract for the IntentVisible API, mirrored structurally from the
 * merged route handlers (apps/web/src/lib/declaration.ts, decision.ts,
 * outcome.ts) so this package never imports server code.
 */

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const VERDICTS = ["AUTO_APPROVE", "REQUIRE_APPROVAL", "DENY"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const INTENT_STATUSES = [
  "DECLARED",
  "PENDING_APPROVAL",
  "APPROVED",
  "DENIED",
  "EXPIRED",
  "EXECUTED",
  "FAILED",
] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const OUTCOMES = ["SUCCEEDED", "FAILED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Verdicts a human can hand the decision API (maps to /approve and /deny). */
export const DECISION_VERDICTS = ["APPROVED", "DENIED"] as const;
export type DecisionVerdict = (typeof DECISION_VERDICTS)[number];

/** Body for POST /api/intents. Mirrors the route's zod schema. */
export interface DeclareIntentRequest {
  /** 1–200 chars; what the agent intends to do (e.g. "deploy"). */
  actionType: string;
  riskLevel: RiskLevel;
  /** 1–1000 chars; human-readable statement of intent. */
  summary: string;
  /** Free-form action parameters; validated server-side only. */
  payload?: Record<string, unknown>;
  /** ISO-8601 datetime (UTC or explicit offset); defaults to declared + 24h. */
  expiresAt?: string;
}

export interface DeclarationResult {
  id: string;
  status: IntentStatus;
  verdict: Verdict;
  /** `policy:<ruleId>` or `human:<identity>`. */
  decidedBy: string;
}

/** Body for POST /api/intents/[id]/outcome. */
export interface ReportOutcomeRequest {
  outcome: Outcome;
}

export interface OutcomeResult {
  id: string;
  status: IntentStatus;
  outcome: Outcome;
  outcomeAt: string | null;
}

export interface DecisionResult {
  id: string;
  status: IntentStatus;
  decidedBy: string;
  decidedAt: string | null;
}
