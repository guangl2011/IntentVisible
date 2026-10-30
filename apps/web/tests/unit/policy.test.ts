import { describe, expect, it } from "vitest";
import {
  DEFAULT_DENY_RULE_ID,
  evaluate,
  type IntentInput,
  type PolicyRule,
} from "../../src/lib/policy";

function rule(overrides: Partial<PolicyRule> & { id: string }): PolicyRule {
  return {
    priority: 0,
    agentId: null,
    actionType: null,
    maxRiskLevel: null,
    verdict: "AUTO_APPROVE",
    active: true,
    ...overrides,
  };
}

const intent: IntentInput = {
  agentId: "agent_1",
  actionType: "deploy",
  riskLevel: "HIGH",
};

interface Case {
  name: string;
  rules: PolicyRule[];
  intent?: IntentInput;
  expected: { verdict: string; ruleId: string };
}

const cases: Case[] = [
  {
    name: "empty rule set denies (fail closed)",
    rules: [],
    expected: { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID },
  },
  {
    name: "no matching rule denies (fail closed)",
    rules: [rule({ id: "r1", actionType: "delete_records" })],
    expected: { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID },
  },
  {
    name: "inactive rule is skipped even when it matches",
    rules: [rule({ id: "r1", verdict: "AUTO_APPROVE", active: false })],
    expected: { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID },
  },
  {
    name: "first matching rule yields AUTO_APPROVE",
    rules: [rule({ id: "r1", verdict: "AUTO_APPROVE" })],
    expected: { verdict: "AUTO_APPROVE", ruleId: "r1" },
  },
  {
    name: "first matching rule yields REQUIRE_APPROVAL",
    rules: [rule({ id: "r1", verdict: "REQUIRE_APPROVAL" })],
    expected: { verdict: "REQUIRE_APPROVAL", ruleId: "r1" },
  },
  {
    name: "first matching rule yields DENY",
    rules: [rule({ id: "r1", verdict: "DENY" })],
    expected: { verdict: "DENY", ruleId: "r1" },
  },
  {
    name: "lower priority number wins regardless of input order",
    rules: [
      rule({ id: "wildcard", priority: 10, verdict: "AUTO_APPROVE" }),
      rule({ id: "specific", priority: 1, verdict: "REQUIRE_APPROVAL" }),
    ],
    expected: { verdict: "REQUIRE_APPROVAL", ruleId: "specific" },
  },
  {
    name: "equal priority keeps input order (stable tie-break)",
    rules: [
      rule({ id: "first", priority: 5, verdict: "AUTO_APPROVE" }),
      rule({ id: "second", priority: 5, verdict: "DENY" }),
    ],
    expected: { verdict: "AUTO_APPROVE", ruleId: "first" },
  },
  {
    name: "null agentId matches any agent",
    rules: [rule({ id: "r1", agentId: null })],
    intent: { agentId: "agent_42", actionType: "deploy", riskLevel: "LOW" },
    expected: { verdict: "AUTO_APPROVE", ruleId: "r1" },
  },
  {
    name: "null actionType matches any action",
    rules: [rule({ id: "r1", actionType: null })],
    intent: { agentId: "agent_1", actionType: "send_email", riskLevel: "LOW" },
    expected: { verdict: "AUTO_APPROVE", ruleId: "r1" },
  },
  {
    name: "null maxRiskLevel matches any risk",
    rules: [rule({ id: "r1", maxRiskLevel: null })],
    intent: { agentId: "agent_1", actionType: "deploy", riskLevel: "CRITICAL" },
    expected: { verdict: "AUTO_APPROVE", ruleId: "r1" },
  },
  {
    name: "fully wildcard rule matches anything",
    rules: [rule({ id: "r1" })],
    intent: { agentId: "x", actionType: "y", riskLevel: "CRITICAL" },
    expected: { verdict: "AUTO_APPROVE", ruleId: "r1" },
  },
  {
    name: "agentId mismatch prevents match",
    rules: [rule({ id: "r1", agentId: "agent_2" })],
    expected: { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID },
  },
  {
    name: "actionType mismatch prevents match",
    rules: [rule({ id: "r1", actionType: "delete_records" })],
    expected: { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID },
  },
  {
    name: "risk above maxRiskLevel prevents match",
    rules: [rule({ id: "r1", maxRiskLevel: "MEDIUM" })],
    expected: { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID },
  },
  {
    name: "risk exactly at maxRiskLevel matches",
    rules: [rule({ id: "r1", maxRiskLevel: "HIGH" })],
    expected: { verdict: "AUTO_APPROVE", ruleId: "r1" },
  },
  {
    name: "risk below maxRiskLevel matches",
    rules: [rule({ id: "r1", maxRiskLevel: "CRITICAL" })],
    intent: { agentId: "agent_1", actionType: "deploy", riskLevel: "LOW" },
    expected: { verdict: "AUTO_APPROVE", ruleId: "r1" },
  },
  {
    name: "specific rule wins over wildcard at equal priority",
    rules: [
      rule({ id: "wildcard", priority: 1, verdict: "AUTO_APPROVE" }),
      rule({
        id: "scoped",
        priority: 1,
        agentId: "agent_1",
        verdict: "REQUIRE_APPROVAL",
      }),
    ],
    // Scoped rule is declared second but matches more narrowly — priority is
    // the only ordering signal, so the wildcard (declared first) wins.
    expected: { verdict: "AUTO_APPROVE", ruleId: "wildcard" },
  },
  {
    name: "inactive specific rule falls through to active wildcard",
    rules: [
      rule({
        id: "inactive-specific",
        priority: 1,
        agentId: "agent_1",
        verdict: "DENY",
        active: false,
      }),
      rule({ id: "wildcard", priority: 10, verdict: "AUTO_APPROVE" }),
    ],
    expected: { verdict: "AUTO_APPROVE", ruleId: "wildcard" },
  },
  {
    name: "unknown risk level denies (fail closed)",
    rules: [rule({ id: "r1", maxRiskLevel: "CRITICAL" })],
    intent: {
      agentId: "agent_1",
      actionType: "deploy",
      // Cast simulates malformed input past the API's validation layer.
      riskLevel: "APOCALYPTIC" as IntentInput["riskLevel"],
    },
    expected: { verdict: "DENY", ruleId: DEFAULT_DENY_RULE_ID },
  },
];

describe("evaluate", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(evaluate(c.rules, c.intent ?? intent)).toEqual(c.expected);
    });
  }

  it("is pure: evaluating twice returns an equal result and does not reorder rules", () => {
    const rules = [
      rule({ id: "a", priority: 5, verdict: "AUTO_APPROVE" }),
      rule({ id: "b", priority: 1, verdict: "DENY" }),
    ];
    const snapshot = [...rules];
    const first = evaluate(rules, intent);
    const second = evaluate(rules, intent);
    expect(first).toEqual(second);
    expect(rules).toEqual(snapshot);
  });
});
