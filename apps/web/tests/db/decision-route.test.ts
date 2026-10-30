import { PrismaClient, type IntentStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as approvePOST } from "../../src/app/api/intents/[id]/approve/route";
import { POST as denyPOST } from "../../src/app/api/intents/[id]/deny/route";
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionToken,
} from "../../src/lib/dashboard-auth";
import { createAgent, createIntent, pendingIntentSeed } from "./fixtures";

/**
 * Route tests for POST /api/intents/[id]/approve|deny, against real Postgres
 * (the anti-race semantics live in SQL). The handlers are invoked directly
 * with forged session cookies — the real login page arrives with the
 * dashboard subtask.
 */

const PASSCODE = "test-passcode";

describe.skipIf(!process.env.DATABASE_URL)("decision API", () => {
  const prisma = new PrismaClient();
  const sessionToken = dashboardSessionToken(PASSCODE);

  const decisionRequest = (
    verb: "approve" | "deny",
    intentId: string,
    cookieHeader?: string,
  ): Request =>
    new Request(`https://example.test/api/intents/${intentId}/${verb}`, {
      method: "POST",
      headers:
        cookieHeader === undefined
          ? { cookie: `${DASHBOARD_SESSION_COOKIE}=${sessionToken}` }
          : cookieHeader === ""
            ? {}
            : { cookie: cookieHeader },
    });

  const call = (
    verb: "approve" | "deny",
    intentId: string,
    cookieHeader?: string,
  ): Promise<Response> => {
    const handler = verb === "approve" ? approvePOST : denyPOST;
    return handler(decisionRequest(verb, intentId, cookieHeader), {
      params: Promise.resolve({ id: intentId }),
    });
  };

  beforeAll(() => {
    process.env.DASHBOARD_PASSCODE = PASSCODE;
  });

  afterAll(async () => {
    delete process.env.DASHBOARD_PASSCODE;
    await prisma.$disconnect();
  });

  it("approves a pending intent and appends exactly one audit row", async () => {
    const { agentId } = await createAgent(prisma, "decide-approve");
    const intent = await createIntent(prisma, agentId, pendingIntentSeed());

    const res = await call("approve", intent.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: intent.id,
      status: "APPROVED",
      decidedBy: "human:dashboard",
    });
    expect(body.decidedAt).toBeTruthy();

    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(row.status).toBe("APPROVED");
    expect(row.decidedBy).toBe("human:dashboard");
    expect(row.decidedAt).not.toBeNull();
    expect(row.outcome).toBeNull();

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

  it("denies a pending intent and appends exactly one audit row", async () => {
    const { agentId } = await createAgent(prisma, "decide-deny");
    const intent = await createIntent(prisma, agentId, pendingIntentSeed());

    const res = await call("deny", intent.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: intent.id,
      status: "DENIED",
      decidedBy: "human:dashboard",
    });

    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(row.status).toBe("DENIED");
    expect(row.decidedBy).toBe("human:dashboard");

    const audits = await prisma.intentAudit.findMany({
      where: { intentId: intent.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      fromStatus: "PENDING_APPROVAL",
      toStatus: "DENIED",
      actor: "human:dashboard",
      actorType: "human",
    });
  });

  it("returns 404 for an unknown intent id", async () => {
    for (const verb of ["approve", "deny"] as const) {
      const res = await call(verb, `nonexistent-${crypto.randomUUID()}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: "not_found" });
    }
  });

  it.each(["DECLARED", "APPROVED", "DENIED", "EXPIRED", "EXECUTED", "FAILED"] as const)(
    "returns 409 when the intent is %s instead of PENDING_APPROVAL",
    async (status: IntentStatus) => {
      const { agentId } = await createAgent(prisma, "decide-wrongstate");
      const intent = await createIntent(prisma, agentId, { status });

      for (const verb of ["approve", "deny"] as const) {
        const res = await call(verb, intent.id);
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ error: "already_decided" });
      }

      // No decision landed: the row is untouched and no audit row exists.
      const row = await prisma.intent.findUniqueOrThrow({
        where: { id: intent.id },
      });
      expect(row.status).toBe(status);
      expect(row.decidedBy).toBeNull();
      expect(
        await prisma.intentAudit.count({ where: { intentId: intent.id } }),
      ).toBe(0);
    },
  );

  it("returns 401 without a session cookie or with a wrong token", async () => {
    const { agentId } = await createAgent(prisma, "decide-auth");
    const intent = await createIntent(prisma, agentId, pendingIntentSeed());

    const noCookie = await call("approve", intent.id, "");
    expect(noCookie.status).toBe(401);

    const wrongToken = await call(
      "approve",
      intent.id,
      `${DASHBOARD_SESSION_COOKIE}=${"0".repeat(64)}`,
    );
    expect(wrongToken.status).toBe(401);

    expect(
      await prisma.intent.findUniqueOrThrow({ where: { id: intent.id } }),
    ).toMatchObject({ status: "PENDING_APPROVAL" });
  });

  it("fails closed when no passcode is configured", async () => {
    const { agentId } = await createAgent(prisma, "decide-failclosed");
    const intent = await createIntent(prisma, agentId, pendingIntentSeed());

    const saved = process.env.DASHBOARD_PASSCODE;
    delete process.env.DASHBOARD_PASSCODE;
    try {
      const res = await call("approve", intent.id);
      expect(res.status).toBe(401);
    } finally {
      process.env.DASHBOARD_PASSCODE = saved;
    }
  });
});
