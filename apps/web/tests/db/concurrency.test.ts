import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as approvePOST } from "../../src/app/api/intents/[id]/approve/route";
import { POST as denyPOST } from "../../src/app/api/intents/[id]/deny/route";
import { POST as outcomePOST } from "../../src/app/api/intents/[id]/outcome/route";
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionToken,
} from "../../src/lib/dashboard-auth";
import { createAgent, createIntent, pendingIntentSeed } from "./fixtures";

/**
 * Concurrency and idempotency regressions (spec acceptance criteria), against
 * real Postgres — the guarantees live in SQL row-lock semantics, so a mocked
 * Prisma would test nothing.
 *
 * The decisive mechanism: every transition is a conditional update
 * (`WHERE status = <required pre-state>`). Under READ COMMITTED, a parallel
 * writer blocks on the row lock, then re-evaluates the predicate against the
 * committed row, matches zero rows, and reports 409 (decisions) or a
 * duplicate no-op (outcomes). Exactly one writer ever lands.
 */

const PASSCODE = "test-passcode";

describe.skipIf(!process.env.DATABASE_URL)("concurrency and idempotency", () => {
  const prisma = new PrismaClient();
  const sessionToken = dashboardSessionToken(PASSCODE);

  const callDecision = (
    verb: "approve" | "deny",
    intentId: string,
  ): Promise<Response> => {
    const handler = verb === "approve" ? approvePOST : denyPOST;
    return handler(
      new Request(`https://example.test/api/intents/${intentId}/${verb}`, {
        method: "POST",
        headers: { cookie: `${DASHBOARD_SESSION_COOKIE}=${sessionToken}` },
      }),
      { params: Promise.resolve({ id: intentId }) },
    );
  };

  const callOutcome = (
    intentId: string,
    rawKey: string,
    outcome: "SUCCEEDED" | "FAILED",
  ): Promise<Response> =>
    outcomePOST(
      new Request(`https://example.test/api/intents/${intentId}/outcome`, {
        method: "POST",
        headers: { "x-api-key": rawKey, "content-type": "application/json" },
        body: JSON.stringify({ outcome }),
      }),
      { params: Promise.resolve({ id: intentId }) },
    );

  beforeAll(() => {
    process.env.DASHBOARD_PASSCODE = PASSCODE;
  });

  afterAll(async () => {
    delete process.env.DASHBOARD_PASSCODE;
    await prisma.$disconnect();
  });

  it("two parallel approvals on one pending intent: exactly one 200, one 409, one audit row", async () => {
    const { agentId } = await createAgent(prisma, "conc-approve-approve");
    const intent = await createIntent(prisma, agentId, pendingIntentSeed());

    const [a, b] = await Promise.all([
      callDecision("approve", intent.id),
      callDecision("approve", intent.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(row.status).toBe("APPROVED");
    expect(row.decidedBy).toBe("human:dashboard");
    expect(row.decidedAt).not.toBeNull();

    const audits = await prisma.intentAudit.findMany({
      where: { intentId: intent.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      fromStatus: "PENDING_APPROVAL",
      toStatus: "APPROVED",
      actor: "human:dashboard",
      actorType: "human",
    });
  });

  it("parallel approve vs deny: exactly one lands and the audit trail matches the winner", async () => {
    const { agentId } = await createAgent(prisma, "conc-approve-deny");
    const intent = await createIntent(prisma, agentId, pendingIntentSeed());

    const [approval, denial] = await Promise.all([
      callDecision("approve", intent.id),
      callDecision("deny", intent.id),
    ]);
    expect([approval.status, denial.status].sort()).toEqual([200, 409]);

    const winner = approval.status === 200 ? "APPROVED" : "DENIED";
    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(row.status).toBe(winner);
    expect(row.decidedBy).toBe("human:dashboard");

    const audits = await prisma.intentAudit.findMany({
      where: { intentId: intent.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      fromStatus: "PENDING_APPROVAL",
      toStatus: winner,
      actor: "human:dashboard",
    });
  });

  it("five parallel approvals: exactly one 200 and one audit row", async () => {
    const { agentId } = await createAgent(prisma, "conc-approve-x5");
    const intent = await createIntent(prisma, agentId, pendingIntentSeed());

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => callDecision("approve", intent.id)),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([
      200, 409, 409, 409, 409,
    ]);
    expect(
      await prisma.intentAudit.count({ where: { intentId: intent.id } }),
    ).toBe(1);
  });

  it("parallel SUCCEEDED and FAILED reports: both 200, first result wins, one audit row", async () => {
    const agent = await createAgent(prisma, "conc-outcome");
    const intent = await createIntent(prisma, agent.agentId, {
      ...pendingIntentSeed(),
      status: "APPROVED",
      decidedBy: "human:dashboard",
      decidedAt: new Date(0),
    });

    const [a, b] = await Promise.all([
      callOutcome(intent.id, agent.rawKey, "SUCCEEDED"),
      callOutcome(intent.id, agent.rawKey, "FAILED"),
    ]);
    // The loser is a duplicate no-op: 200 with the stored first result.
    expect([a.status, b.status].sort()).toEqual([200, 200]);

    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    // Exactly one of the two claims was recorded.
    expect(["SUCCEEDED", "FAILED"]).toContain(row.outcome);
    const recorded = row.outcome as "SUCCEEDED" | "FAILED";
    expect(row.status).toBe(recorded === "SUCCEEDED" ? "EXECUTED" : "FAILED");
    expect(row.outcomeAt).not.toBeNull();

    const audits = await prisma.intentAudit.findMany({
      where: { intentId: intent.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      fromStatus: "APPROVED",
      toStatus: recorded === "SUCCEEDED" ? "EXECUTED" : "FAILED",
      actor: `agent:${agent.agentName}`,
      actorType: "agent",
    });

    // Both bodies must echo the first result, never the loser's claim.
    for (const res of [a, b]) {
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ outcome: recorded });
    }
  });

  it("a decision racing an outcome report leaves a consistent trail in every interleaving", async () => {
    const agent = await createAgent(prisma, "conc-decide-outcome");
    const intent = await createIntent(prisma, agent.agentId, pendingIntentSeed());

    const [approval, report] = await Promise.all([
      callDecision("approve", intent.id),
      callOutcome(intent.id, agent.rawKey, "SUCCEEDED"),
    ]);

    // The outcome was reported while the intent was PENDING_APPROVAL (409) or
    // after the approval landed (200 EXECUTED) — both are safe endings.
    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    const audits = await prisma.intentAudit.findMany({
      where: { intentId: intent.id },
      orderBy: { createdAt: "asc" },
    });

    if (report.status === 409) {
      // Report observed PENDING_APPROVAL and was rejected; the approval stands.
      expect(approval.status).toBe(200);
      expect(row.status).toBe("APPROVED");
      expect(row.outcome).toBeNull();
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        fromStatus: "PENDING_APPROVAL",
        toStatus: "APPROVED",
      });
    } else {
      // Approval committed first; the report executed from APPROVED.
      expect(approval.status).toBe(200);
      expect(report.status).toBe(200);
      expect(row.status).toBe("EXECUTED");
      expect(row.outcome).toBe("SUCCEEDED");
      expect(audits.map((a) => [a.fromStatus, a.toStatus])).toEqual([
        ["PENDING_APPROVAL", "APPROVED"],
        ["APPROVED", "EXECUTED"],
      ]);
    }
  });
});
