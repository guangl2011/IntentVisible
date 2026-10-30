/**
 * Placeholder for the IntentVisible TS client. The real `declareIntent` /
 * `reportOutcome` implementation (typed errors, fetch stubs, tests) lands in
 * the client subtask; these types are the shared contract meanwhile.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Verdict = "AUTO_APPROVE" | "REQUIRE_APPROVAL" | "DENY";

export interface DeclareIntentRequest {
  action: string;
  target: string;
  params?: Record<string, unknown>;
  risk: RiskLevel;
}

export interface DeclareIntentResponse {
  id: string;
  status: string;
  verdict: Verdict;
  decidedBy: string;
}

export interface ReportOutcomeRequest {
  outcome: "SUCCEEDED" | "FAILED";
}

export function declareIntent(request: DeclareIntentRequest): Promise<DeclareIntentResponse> {
  return Promise.reject(
    new Error(`declareIntent is not implemented yet (action: ${request.action})`),
  );
}

export function reportOutcome(intentId: string, request: ReportOutcomeRequest): Promise<void> {
  return Promise.reject(
    new Error(`reportOutcome is not implemented yet (intent: ${intentId}, outcome: ${request.outcome})`),
  );
}
