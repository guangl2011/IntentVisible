import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Intent, IntentStatus, PrismaClient } from "@prisma/client";
import { RISK_LEVELS, type Evaluation, type RiskLevel } from "./policy";

/**
 * Declaration API core: request validation, verdict-to-status mapping, and
 * the transactional intent + audit persistence. Pure pieces are exported
 * separately so unit tests cover them without a database.
 */

export const DEFAULT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Request body for POST /api/intents. `payload`/`expiresAt` are optional. */
export const DeclareIntentBodySchema = z.object({
  actionType: z.string().min(1).max(200),
  riskLevel: z.enum(RISK_LEVELS),
  summary: z.string().min(1).max(1000),
  payload: z.record(z.string(), z.unknown()).optional(),
  // ISO-8601 datetime, UTC or with an explicit offset.
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export type DeclareIntentBody = z.infer<typeof DeclareIntentBodySchema>;

/** Map a policy evaluation to the intent status and decidedBy it produces. */
export function mapEvaluation(evaluation: Evaluation): {
  status: IntentStatus;
  decidedBy: string;
} {
  const decidedBy = `policy:${evaluation.ruleId}`;
  switch (evaluation.verdict) {
    case "AUTO_APPROVE":
      return { status: "APPROVED", decidedBy };
    case "REQUIRE_APPROVAL":
      return { status: "PENDING_APPROVAL", decidedBy };
    case "DENY":
      return { status: "DENIED", decidedBy };
  }
}

/** TTL from the declaration clock: explicit when supplied, 24h otherwise. */
export function resolveExpiresAt(now: Date, expiresAt?: string): Date {
  return expiresAt ? new Date(expiresAt) : new Date(now.getTime() + DEFAULT_INTENT_TTL_MS);
}

export interface DeclarationToPersist {
  agentId: string;
  actionType: string;
  riskLevel: RiskLevel;
  summary: string;
  payload: Record<string, unknown> | undefined;
  status: IntentStatus;
  decidedBy: string;
  expiresAt: Date;
  now: Date;
}

/**
 * Persist one declaration: the intent row and its initial audit row, in a
 * single transaction. The intent is created directly in its decided status —
 * DECLARED is the audit trail's fromStatus, never a row that later mutates.
 * Any failure rolls back both writes (forced-failure tests assert this).
 */
export async function persistDeclaration(
  prisma: PrismaClient,
  declaration: DeclarationToPersist,
): Promise<Intent> {
  return prisma.$transaction(async (tx) => {
    const intent = await tx.intent.create({
      data: {
        agentId: declaration.agentId,
        actionType: declaration.actionType,
        riskLevel: declaration.riskLevel,
        summary: declaration.summary,
        payload: (declaration.payload ?? {}) as Prisma.InputJsonValue,
        status: declaration.status,
        decidedBy: declaration.decidedBy,
        decidedAt: declaration.now,
        expiresAt: declaration.expiresAt,
      },
    });
    await tx.intentAudit.create({
      data: {
        intentId: intent.id,
        fromStatus: "DECLARED",
        toStatus: declaration.status,
        actor: declaration.decidedBy,
        actorType: "policy",
      },
    });
    return intent;
  });
}
