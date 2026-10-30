import type { Intent, IntentStatus, Outcome, PrismaClient } from "@prisma/client";
import { hashApiKey } from "../../src/lib/agent-auth";

/**
 * Shared DB fixtures for route tests. Rows are namespaced with random
 * suffixes because all test files share one CI database; assertions must
 * always scope by the returned ids, never by global counts.
 */

export interface TestAgent {
  agentId: string;
  agentName: string;
  /** Raw API key — the only time it exists; the DB stores only its hash. */
  rawKey: string;
}

export async function createAgent(
  prisma: PrismaClient,
  label: string,
): Promise<TestAgent> {
  const rawKey = `ivt_${label}_${crypto.randomUUID()}`;
  const agent = await prisma.agent.create({
    data: {
      name: `${label}-${crypto.randomUUID()}`,
      keyHash: hashApiKey(rawKey),
      keyPrefix: rawKey.slice(0, 8),
    },
  });
  return { agentId: agent.id, agentName: agent.name, rawKey };
}

export interface IntentSeed {
  status?: IntentStatus;
  decidedBy?: string;
  decidedAt?: Date;
  outcome?: Outcome;
  outcomeAt?: Date;
  expiresAt?: Date;
}

export async function createIntent(
  prisma: PrismaClient,
  agentId: string,
  seed: IntentSeed = {},
): Promise<Intent> {
  return prisma.intent.create({
    data: {
      agentId,
      actionType: "test_action",
      riskLevel: "MEDIUM",
      summary: `fixture: ${crypto.randomUUID()}`,
      status: seed.status ?? "DECLARED",
      decidedBy: seed.decidedBy,
      decidedAt: seed.decidedAt,
      outcome: seed.outcome,
      outcomeAt: seed.outcomeAt,
      expiresAt: seed.expiresAt ?? new Date(Date.now() + 3_600_000),
    },
  });
}

/** A pending intent as the declaration API would have left it. */
export function pendingIntentSeed(): IntentSeed {
  return {
    status: "PENDING_APPROVAL",
    decidedBy: "policy:test-rule",
    decidedAt: new Date(0),
  };
}
