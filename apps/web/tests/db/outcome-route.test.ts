import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { POST as outcomePOST } from "../../src/app/api/intents/[id]/outcome/route";
import { createAgent, createIntent, pendingIntentSeed } from "./fixtures";

/**
 * Route tests for POST /api/intents/[id]/outcome, against real Postgres:
 * first-report-wins idempotency, ownership, and wrong-state rejection.
 */

describe.skipIf(!process.env.DATABASE_URL)("outcome API", () => {
  const prisma = new PrismaClient();

  const outcomeRequest = (
    intentId: string,
    rawKey: string,
    body?: unknown,
  ): Request =>
    new Request(`https://example.test/api/intents/${intentId}/outcome`, {
      method: "POST",
      headers: { "x-api-key": rawKey, "content-type": "application/json" },
      body:
        body === undefined
          ? JSON.stringify({ outcome: "SUCCEEDED" })
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });

  const call = (intentId: string, rawKey: string, body?: unknown) =>
    outcomePOST(outcomeRequest(intentId, rawKey, body), {
      params: Promise.resolve({ id: intentId }),
    });

  const approvedIntentFor = async (label: string) => {
    const agent = await createAgent(prisma, label);
    const intent = await createIntent(prisma, agent.agentId, {
      ...pendingIntentSeed(),
      status: "APPROVED",
      decidedBy: "human:dashboard",
      decidedAt: new Date(0),
    });
    return { agent, intent };
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("moves an approved intent to EXECUTED on SUCCEEDED and appends one audit row", async () => {
    const { agent, intent } = await approvedIntentFor("outcome-ok");

    const res = await call(intent.id, agent.rawKey, { outcome: "SUCCEEDED" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: intent.id,
      status: "EXECUTED",
      outcome: "SUCCEEDED",
    });
    expect(body.outcomeAt).toBeTruthy();

    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(row.status).toBe("EXECUTED");
    expect(row.outcome).toBe("SUCCEEDED");
    expect(row.outcomeAt).not.toBeNull();

    const audits = await prisma.intentAudit.findMany({
      where: { intentId: intent.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      fromStatus: "APPROVED",
      toStatus: "EXECUTED",
      actor: `agent:${agent.agentName}`,
      actorType: "agent",
    });
  });

  it("moves an approved intent to FAILED on FAILED", async () => {
    const { agent, intent } = await approvedIntentFor("outcome-failed");

    const res = await call(intent.id, agent.rawKey, { outcome: "FAILED" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "FAILED", outcome: "FAILED" });

    const audits = await prisma.intentAudit.findMany({
      where: { intentId: intent.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ fromStatus: "APPROVED", toStatus: "FAILED" });
  });

  it("returns the first result unchanged on a duplicate report, with a single audit row", async () => {
    const { agent, intent } = await approvedIntentFor("outcome-dup");

    const first = await call(intent.id, agent.rawKey, { outcome: "SUCCEEDED" });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as Record<string, unknown>;

    // A retry claiming the opposite outcome must not flip state.
    const second = await call(intent.id, agent.rawKey, { outcome: "FAILED" });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);

    const row = await prisma.intent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(row.status).toBe("EXECUTED");
    expect(row.outcome).toBe("SUCCEEDED");
    expect(
      await prisma.intentAudit.count({ where: { intentId: intent.id } }),
    ).toBe(1);
  });

  it("returns 401 for a missing key, an unknown key, another agent's key, or an inactive agent", async () => {
    const { agent, intent } = await approvedIntentFor("outcome-auth");
    const other = await createAgent(prisma, "outcome-auth-other");

    expect((await call(intent.id, "")).status).toBe(401);
    expect((await call(intent.id, "not-a-real-key")).status).toBe(401);
    // Known key, but not this intent's owner: indistinguishable 401 body.
    const foreign = await call(intent.id, other.rawKey);
    expect(foreign.status).toBe(401);
    expect(await foreign.json()).toMatchObject({ error: "unauthorized" });

    await prisma.agent.update({
      where: { id: agent.agentId },
      data: { active: false },
    });
    expect((await call(intent.id, agent.rawKey)).status).toBe(401);
  });

  it("returns 404 for an unknown intent id", async () => {
    const agent = await createAgent(prisma, "outcome-404");
    const res = await call(`nonexistent-${crypto.randomUUID()}`, agent.rawKey);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  it.each(["DECLARED", "PENDING_APPROVAL", "DENIED", "EXPIRED"] as const)(
    "returns 409 when the intent is %s",
    async (status) => {
      const agent = await createAgent(prisma, "outcome-wrongstate");
      const intent = await createIntent(prisma, agent.agentId, {
        ...pendingIntentSeed(),
        status,
      });

      const res = await call(intent.id, agent.rawKey, { outcome: "SUCCEEDED" });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: "invalid_state",
        status,
      });
      expect(
        await prisma.intentAudit.count({ where: { intentId: intent.id } }),
      ).toBe(0);
    },
  );

  it("returns 422 for a malformed body or an unknown outcome value", async () => {
    const { agent, intent } = await approvedIntentFor("outcome-422");

    const malformed = await call(intent.id, agent.rawKey, "not-json{");
    expect(malformed.status).toBe(422);

    const missing = await call(intent.id, agent.rawKey, {});
    expect(missing.status).toBe(422);

    const unknown = await call(intent.id, agent.rawKey, { outcome: "MAYBE" });
    expect(unknown.status).toBe(422);

    // None of the invalid reports changed state.
    expect(
      await prisma.intent.findUniqueOrThrow({ where: { id: intent.id } }),
    ).toMatchObject({ status: "APPROVED", outcome: null });
  });
});
