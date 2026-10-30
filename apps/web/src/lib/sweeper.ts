import type { IntentStatus, PrismaClient } from "@prisma/client";

// Who the sweeper records as the decider on expired intents. Follows the
// spec's "<kind>:<identity>" pattern used by policy and human decisions.
export const SWEEPER_ACTOR = "system:expiry-sweeper";

// Only these statuses expire (spec); terminal and DECLARED states are untouched.
const EXPIRABLE_STATUSES: IntentStatus[] = ["PENDING_APPROVAL", "APPROVED"];

export interface ExpiryResult {
  /** Number of intents actually moved to EXPIRED by this run. */
  expired: number;
}

/**
 * Move intents past their TTL into EXPIRED, appending one audit row per
 * transition. Clock comes in as `now` so tests control time explicitly.
 *
 * Idempotent by construction: EXPIRED is not in EXPIRABLE_STATUSES, so a
 * second run finds nothing and changes nothing.
 */
export async function expireStaleIntents(
  prisma: PrismaClient,
  now: Date,
): Promise<ExpiryResult> {
  return prisma.$transaction(async (tx) => {
    const stale = await tx.intent.findMany({
      where: {
        status: { in: EXPIRABLE_STATUSES },
        expiresAt: { lt: now },
      },
      select: { id: true, status: true },
    });

    let expired = 0;
    for (const intent of stale) {
      // Conditional update: if a human decision races the sweeper, the row's
      // status has moved and this write matches zero rows — the human wins.
      const moved = await tx.intent.updateMany({
        where: { id: intent.id, status: intent.status },
        data: { status: "EXPIRED", decidedBy: SWEEPER_ACTOR, decidedAt: now },
      });
      if (moved.count === 0) continue;

      await tx.intentAudit.create({
        data: {
          intentId: intent.id,
          fromStatus: intent.status,
          toStatus: "EXPIRED",
          actor: SWEEPER_ACTOR,
          actorType: "system",
        },
      });
      expired += 1;
    }

    return { expired };
  });
}
