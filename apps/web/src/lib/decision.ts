import type { Intent, IntentStatus, PrismaClient } from "@prisma/client";
import {
  DASHBOARD_IDENTITY,
  dashboardSessionToken,
  humanActor,
  isAuthorizedDashboardRequest,
} from "./dashboard-auth";
import { getPrisma } from "./prisma";

/**
 * Human decision core: the PENDING_APPROVAL → APPROVED|DENIED transition and
 * the HTTP shell shared by the approve and deny routes.
 *
 * The state-machine rule (spec): there is no path into APPROVED except a human
 * approval of an intent that is PENDING_APPROVAL at the moment of the write.
 * A find-then-write alone would race a parallel decision, so the write
 * re-checks the status and zero matched rows maps to 409. The intent update
 * and its audit row commit in one transaction — every transition appends.
 */

export type DecisionVerdict = Extract<IntentStatus, "APPROVED" | "DENIED">;

export type DecisionResult =
  | { ok: true; intent: Intent }
  | { ok: false; reason: "not_found" | "conflict" };

/** Next.js dynamic-route context for /api/intents/[id]/... handlers. */
export interface IntentRouteContext {
  params: Promise<{ id: string }>;
}

export async function decidePendingIntent(
  prisma: PrismaClient,
  params: {
    intentId: string;
    verdict: DecisionVerdict;
    actor: string;
    now: Date;
  },
): Promise<DecisionResult> {
  const { intentId, verdict, actor, now } = params;

  const existing = await prisma.intent.findUnique({ where: { id: intentId } });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "PENDING_APPROVAL") {
    return { ok: false, reason: "conflict" };
  }

  return prisma.$transaction(async (tx) => {
    // The conditional update is the race authority: if a parallel decision or
    // the expiry sweeper moved the row first, this matches zero rows.
    const moved = await tx.intent.updateMany({
      where: { id: intentId, status: "PENDING_APPROVAL" },
      data: { status: verdict, decidedBy: actor, decidedAt: now },
    });
    if (moved.count === 0) return { ok: false, reason: "conflict" as const };

    await tx.intentAudit.create({
      data: {
        intentId,
        fromStatus: "PENDING_APPROVAL",
        toStatus: verdict,
        actor,
        actorType: "human",
      },
    });

    const intent = await tx.intent.findUniqueOrThrow({
      where: { id: intentId },
    });
    return { ok: true, intent };
  });
}

/**
 * HTTP shell for POST /api/intents/[id]/approve and /deny.
 * Dashboard-session authenticated; 401 → 404 → 409, then the 200 decision.
 */
export async function handleDecisionRequest(
  request: Request,
  context: IntentRouteContext,
  verdict: DecisionVerdict,
): Promise<Response> {
  const session = isAuthorizedDashboardRequest(
    request,
    dashboardSessionToken(process.env.DASHBOARD_PASSCODE),
  );
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await decidePendingIntent(getPrisma(), {
    intentId: id,
    verdict,
    actor: humanActor(DASHBOARD_IDENTITY),
    now: new Date(),
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ error: "already_decided" }, { status: 409 });
  }

  return Response.json(
    {
      id: result.intent.id,
      status: result.intent.status,
      decidedBy: result.intent.decidedBy,
      decidedAt: result.intent.decidedAt,
    },
    { status: 200 },
  );
}
