import type { Intent, Outcome, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticateAgent } from "./agent-auth";
import type { IntentRouteContext } from "./decision";
import { getPrisma } from "./prisma";

/**
 * Agent outcome reporting core: the APPROVED → EXECUTED|FAILED transition and
 * its HTTP shell (spec: the agent may execute only from APPROVED, then reports
 * what happened).
 *
 * Two guarantees shape the code:
 * - First report wins. A duplicate report returns 200 with the stored result
 *   and changes nothing, so agent retries can't corrupt the trail.
 * - The transition is a conditional update inside one transaction with its
 *   audit row, so a parallel report (or the expiry sweeper) that moved the row
 *   first loses cleanly instead of double-writing.
 */

export const OutcomeReportSchema = z.object({
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
});

export type OutcomeReportBody = z.infer<typeof OutcomeReportSchema>;

/** SUCCEEDED marks the intent EXECUTED; FAILED lands on the FAILED status. */
export function mapOutcomeToStatus(outcome: Outcome): "EXECUTED" | "FAILED" {
  return outcome === "SUCCEEDED" ? "EXECUTED" : "FAILED";
}

export type OutcomeResult =
  | { ok: true; intent: Intent; duplicate: boolean }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden" }
  | { ok: false; reason: "conflict"; intent: Intent | null };

export async function reportOutcome(
  prisma: PrismaClient,
  params: {
    intentId: string;
    agentId: string;
    agentName: string;
    outcome: Outcome;
    now: Date;
  },
): Promise<OutcomeResult> {
  const { intentId, agentId, agentName, outcome, now } = params;

  const existing = await prisma.intent.findUnique({ where: { id: intentId } });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.agentId !== agentId) return { ok: false, reason: "forbidden" };
  if (existing.outcome !== null) {
    return { ok: true, intent: existing, duplicate: true };
  }
  if (existing.status !== "APPROVED") {
    return { ok: false, reason: "conflict", intent: existing };
  }

  const toStatus = mapOutcomeToStatus(outcome);
  return prisma.$transaction(async (tx) => {
    const moved = await tx.intent.updateMany({
      where: { id: intentId, status: "APPROVED" },
      data: { status: toStatus, outcome, outcomeAt: now },
    });
    if (moved.count === 0) {
      // A parallel report won the row, or the sweeper expired it. A stored
      // outcome means this report lost the first-wins race (a 200 no-op);
      // anything else is a genuine conflict.
      const current = await tx.intent.findUnique({ where: { id: intentId } });
      if (current && current.outcome !== null) {
        return { ok: true, intent: current, duplicate: true };
      }
      return { ok: false, reason: "conflict" as const, intent: current };
    }

    await tx.intentAudit.create({
      data: {
        intentId,
        fromStatus: "APPROVED",
        toStatus,
        actor: `agent:${agentName}`,
        actorType: "agent",
      },
    });

    const intent = await tx.intent.findUniqueOrThrow({
      where: { id: intentId },
    });
    return { ok: true, intent, duplicate: false };
  });
}

/**
 * HTTP shell for POST /api/intents/[id]/outcome. Agent-key authenticated;
 * both a bad key and another agent's key map to the same 401 body so key
 * probes learn nothing about which intent ids exist.
 */
export async function handleOutcomeRequest(
  request: Request,
  context: IntentRouteContext,
): Promise<Response> {
  const prisma = getPrisma();

  const agent = await authenticateAgent(
    prisma,
    request.headers.get("x-api-key"),
  );
  if (!agent) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json_body" }, { status: 422 });
  }
  const parsed = OutcomeReportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { id } = await context.params;
  const result = await reportOutcome(prisma, {
    intentId: id,
    agentId: agent.agent.id,
    agentName: agent.agent.name,
    outcome: parsed.data.outcome,
    now: new Date(),
  });

  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        return Response.json({ error: "not_found" }, { status: 404 });
      case "forbidden":
        return Response.json({ error: "unauthorized" }, { status: 401 });
      case "conflict":
        return Response.json(
          { error: "invalid_state", status: result.intent?.status },
          { status: 409 },
        );
    }
  }

  return Response.json(
    {
      id: result.intent.id,
      status: result.intent.status,
      outcome: result.intent.outcome,
      outcomeAt: result.intent.outcomeAt,
    },
    { status: 200 },
  );
}
