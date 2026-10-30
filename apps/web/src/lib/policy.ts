// Pure policy evaluation: same input always yields the same verdict, no I/O,
// no clock, no DB. The gate's auditability depends on this staying pure.
//
// These types mirror the Prisma enums in prisma/schema.prisma structurally so
// this module never imports the generated client; Prisma rows are assignable.

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const VERDICTS = ["AUTO_APPROVE", "REQUIRE_APPROVAL", "DENY"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** ruleId reported when no rule matched — the fail-closed default. */
export const DEFAULT_DENY_RULE_ID = "default-deny";

/** Structural subset of the Prisma PolicyRule row. Null fields are wildcards. */
export interface PolicyRule {
  id: string;
  /** Lower number = evaluated first; the first matching rule wins. */
  priority: number;
  agentId: string | null;
  actionType: string | null;
  /** Matches when the intent's risk is at or below this level. */
  maxRiskLevel: RiskLevel | null;
  verdict: Verdict;
  active: boolean;
}

export interface IntentInput {
  agentId: string;
  actionType: string;
  riskLevel: RiskLevel;
}

export interface Evaluation {
  verdict: Verdict;
  /** id of the first matching rule, or DEFAULT_DENY_RULE_ID when nothing matched. */
  ruleId: string;
}

const RISK_RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

// why: fail closed — an unrankable risk level must never satisfy a risk cap,
// because that would let malformed input drift toward auto-approval.
function riskIsKnown(level: string): level is RiskLevel {
  return level in RISK_RANK;
}

function matches(rule: PolicyRule, intent: IntentInput): boolean {
  if (rule.agentId !== null && rule.agentId !== intent.agentId) return false;
  if (rule.actionType !== null && rule.actionType !== intent.actionType) return false;
  if (rule.maxRiskLevel !== null) {
    if (!riskIsKnown(intent.riskLevel)) return false;
    if (RISK_RANK[intent.riskLevel] > RISK_RANK[rule.maxRiskLevel]) return false;
  }
  return true;
}

export function evaluate(rules: PolicyRule[], intent: IntentInput): Evaluation {
  // Array.prototype.sort is stable, so rules with equal priority keep their
  // input order — the tie-break is "first declared wins", deterministic.
  const first = rules
    .filter((rule) => rule.active && matches(rule, intent))
    .sort((a, b) => a.priority - b.priority)[0];

  if (!first) return { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID };
  return { verdict: first.verdict, ruleId: first.id };
}
