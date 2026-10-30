import { PrismaClient, type IntentStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expireStaleIntents, SWEEPER_ACTOR } from "../../src/lib/sweeper";

// Runs only where a database exists (CI db job). Locally without
// DATABASE_URL this suite is skipped, so `pnpm test` stays green everywhere.
describe.skipIf(!process.env.DATABASE_URL)("expiry sweeper", () => {
  const prisma = new PrismaClient();
  // Clock control: `now` is an argument, so tests seed fixed offsets and
  // never depend on wall-clock time.
  const now = new Date("2026-10-30T12:00:00Z");
  const hour = 3_600_000;

  const seedIntent = async (status: IntentStatus, expiresAt: Date, label: string) => {
    const agent = await prisma.agent.create({
      data: {
        name: `sweeper-${label}-${crypto.randomUUID()}`,
        keyHash: `hash-${label}-${crypto.randomUUID()}`,
        keyPrefix: "test",
      },
    });
    return prisma.intent.create({
      data: {
        agentId: agent.id,
        actionType: "test",
        riskLevel: "LOW",
        summary: `sweeper probe: ${label}`,
        status,
        expiresAt,
      },
    });
  };

  let pendingExpired: { id: string };
  let approvedExpired: { id: string };
  let pendingFresh: { id: string };
  let deniedExpired: { id: string };
  let declaredExpired: { id: string };

  beforeAll(async () => {
    [pendingExpired, approvedExpired, pendingFresh, deniedExpired, declaredExpired] =
      await Promise.all([
        seedIntent("PENDING_APPROVAL", new Date(now.getTime() - 1 * hour), "pending-expired"),
        seedIntent("APPROVED", new Date(now.getTime() - 60_000), "approved-expired"),
        seedIntent("PENDING_APPROVAL", new Date(now.getTime() + 1 * hour), "pending-fresh"),
        seedIntent("DENIED", new Date(now.getTime() - 1 * hour), "denied-expired"),
        seedIntent("DECLARED", new Date(now.getTime() - 1 * hour), "declared-expired"),
      ]);
  });

  it("moves exactly the stale PENDING_APPROVAL and APPROVED intents to EXPIRED", async () => {
    const result = await expireStaleIntents(prisma, now);
    expect(result.expired).toBe(2);

    const statuses = async (id: string) =>
      (await prisma.intent.findUniqueOrThrow({ where: { id } })).status;

    await expect(statuses(pendingExpired.id)).resolves.toBe("EXPIRED");
    await expect(statuses(approvedExpired.id)).resolves.toBe("EXPIRED");
    await expect(statuses(pendingFresh.id)).resolves.toBe("PENDING_APPROVAL");
    await expect(statuses(deniedExpired.id)).resolves.toBe("DENIED");
    await expect(statuses(declaredExpired.id)).resolves.toBe("DECLARED");

    const audits = await prisma.intentAudit.findMany({
      where: { intentId: { in: [pendingExpired.id, approvedExpired.id] } },
    });
    expect(audits).toHaveLength(2);
    expect(audits.map((a) => [a.fromStatus, a.toStatus, a.actor, a.actorType])).toEqual(
      expect.arrayContaining([
        ["APPROVED", "EXPIRED", SWEEPER_ACTOR, "system"],
        ["PENDING_APPROVAL", "EXPIRED", SWEEPER_ACTOR, "system"],
      ]),
    );
  });

  it("is a no-op on a second run", async () => {
    const auditsBefore = await prisma.intentAudit.count();
    const result = await expireStaleIntents(prisma, now);
    expect(result.expired).toBe(0);
    expect(await prisma.intentAudit.count()).toBe(auditsBefore);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
