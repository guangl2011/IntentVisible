import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs only where a database exists (CI db job). Locally without
// DATABASE_URL this suite is skipped, so `pnpm test` stays green everywhere.
describe.skipIf(!process.env.DATABASE_URL)("audit immutability", () => {
  const prisma = new PrismaClient();
  const runId = crypto.randomUUID();
  let intentId: string;
  let auditId: string;

  beforeAll(async () => {
    const agent = await prisma.agent.create({
      data: {
        name: `trigger-probe-${runId}`,
        keyHash: `hash-${runId}`,
        keyPrefix: "test",
      },
    });
    const intent = await prisma.intent.create({
      data: {
        agentId: agent.id,
        actionType: "test",
        riskLevel: "LOW",
        summary: "audit immutability probe",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    intentId = intent.id;
    const audit = await prisma.intentAudit.create({
      data: {
        intentId: intent.id,
        fromStatus: "DECLARED",
        toStatus: "PENDING_APPROVAL",
        actor: "test:probe",
        actorType: "system",
      },
    });
    auditId = audit.id;
  });

  it("still allows appending audit rows", async () => {
    // Count scoped to this intent: db test files share the database and run
    // in parallel, so a global count would race the other file's inserts.
    const before = await prisma.intentAudit.count({ where: { intentId } });
    await prisma.intentAudit.create({
      data: {
        intentId,
        fromStatus: "PENDING_APPROVAL",
        toStatus: "APPROVED",
        actor: "test:probe",
        actorType: "human",
      },
    });
    expect(await prisma.intentAudit.count({ where: { intentId } })).toBe(before + 1);
  });

  it("rejects UPDATE on IntentAudit", async () => {
    await expect(
      prisma.$executeRaw`UPDATE "IntentAudit" SET "actor" = 'tampered' WHERE "id" = ${auditId}`,
    ).rejects.toThrow(/append-only/);
  });

  it("rejects DELETE on IntentAudit", async () => {
    await expect(
      prisma.$executeRaw`DELETE FROM "IntentAudit" WHERE "id" = ${auditId}`,
    ).rejects.toThrow(/append-only/);
  });

  it("rejects TRUNCATE on IntentAudit", async () => {
    await expect(prisma.$executeRawUnsafe(`TRUNCATE "IntentAudit"`)).rejects.toThrow(
      /append-only/,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
