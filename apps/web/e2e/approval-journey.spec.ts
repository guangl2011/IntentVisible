import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { hashApiKey } from "../src/lib/agent-auth";
import { E2E_CRON_SECRET, E2E_DATABASE_URL, E2E_PASSCODE } from "./config-url";

/**
 * The capstone e2e journey (spec art_7RqplooD): one suite that walks the
 * complete gate — agent created in the UI → intent declared over HTTP with
 * the one-time key → policy verdict → queue approval → outcome reported over
 * HTTP → the full trail in history. Plus the two failure paths the spec
 * calls out: fail-closed denial and the expiry sweeper.
 *
 * These tests share the dev database with the other specs; every entity is
 * scoped by a unique marker so parallel files stay isolated.
 */

const PASSCODE = E2E_PASSCODE;

// The webServer's env only reaches the dev server; the spec's own Prisma
// seeding needs the same database.
process.env.DATABASE_URL ??= E2E_DATABASE_URL;

const prisma = new PrismaClient();

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/queue");
}

/** Backdoor agent fixture for the non-UI tests: raw key is known by design. */
async function createAgentFixture(marker: string) {
  const rawKey = `ivt_${marker}`;
  const agent = await prisma.agent.create({
    data: {
      name: `${marker}-agent`,
      keyHash: hashApiKey(rawKey),
      keyPrefix: rawKey.slice(0, 8),
    },
  });
  return { agent, rawKey };
}

/** Agent-scoped rule so this agent's declarations reach a known verdict. */
function requireApprovalRule(agentId: string, marker: string, actionType: string) {
  return prisma.policyRule.create({
    data: {
      name: `${marker}-rule`,
      priority: 1,
      agentId,
      actionType,
      maxRiskLevel: "HIGH",
      verdict: "REQUIRE_APPROVAL",
    },
  });
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("journey: UI-created agent declares, queue approves, outcome lands in history", async ({
  page,
  request,
}) => {
  const marker = `e2e-journey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const agentName = `${marker}-agent`;

  // ── Step 1: create the agent in the dashboard, capture the one-time key.
  await login(page);
  await page.goto("/agents");
  await page.getByLabel("Agent name").fill(agentName);
  await page.getByRole("button", { name: "Create agent" }).click();

  const reveal = page.getByTestId("raw-api-key");
  await expect(reveal).toBeVisible();
  const rawKey = (await reveal.textContent()) ?? "";
  expect(rawKey).toMatch(/^ivk_[0-9a-f]{48}$/);

  const agent = await prisma.agent.findUniqueOrThrow({ where: { name: agentName } });

  // ── Step 2: policy rule scoped to this agent — send_email needs a human.
  await requireApprovalRule(agent.id, marker, "send_email");

  // ── Step 3: the agent declares via the API with its key.
  const summary = `${marker} notify waitlist`;
  const declared = await request.post("/api/intents", {
    headers: { "x-api-key": rawKey },
    data: {
      actionType: "send_email",
      riskLevel: "HIGH",
      summary,
      payload: { recipients: 42 },
    },
  });
  expect(declared.status()).toBe(201);
  const declaration = await declared.json();
  expect(declaration.status).toBe("PENDING_APPROVAL");
  expect(declaration.verdict).toBe("REQUIRE_APPROVAL");
  expect(String(declaration.decidedBy)).toMatch(/^policy:/);
  const intentId: string = declaration.id;

  // ── Step 4: the queue shows the pending intent.
  await page.goto("/queue");
  const row = page.locator(`[data-intent-id="${intentId}"]`);
  await expect(row).toContainText(agentName);
  await expect(row).toContainText("send_email");
  await expect(row).toContainText(summary);
  await expect(row).toContainText("HIGH risk");
  await expect(row).toContainText("PENDING_APPROVAL");

  // ── Step 5: a human approves it in the queue.
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(`[data-intent-id="${intentId}"]`)).toHaveCount(0);

  const approved = await prisma.intent.findUniqueOrThrow({ where: { id: intentId } });
  expect(approved.status).toBe("APPROVED");
  expect(approved.decidedBy).toBe("human:dashboard");

  // ── Step 6: the agent reports the outcome via the API.
  // A different agent's key learns nothing: same 401 as a bad key.
  const otherAgent = await createAgentFixture(`${marker}-other`);
  const strangerReport = await request.post(`/api/intents/${intentId}/outcome`, {
    headers: { "x-api-key": otherAgent.rawKey },
    data: { outcome: "SUCCEEDED" },
  });
  expect(strangerReport.status()).toBe(401);

  const reported = await request.post(`/api/intents/${intentId}/outcome`, {
    headers: { "x-api-key": rawKey },
    data: { outcome: "SUCCEEDED" },
  });
  expect(reported.status()).toBe(200);
  expect((await reported.json()).status).toBe("EXECUTED");

  // ── Step 7: history shows the full trail.
  await page.goto("/history?status=EXECUTED");
  const historyRow = page.locator(`[data-intent-id="${intentId}"]`);
  await expect(historyRow).toContainText("EXECUTED");
  await expect(historyRow).toContainText(agentName);
  await expect(historyRow).toContainText("Outcome SUCCEEDED");

  // The append-only audit trail holds every transition, in order.
  const audits = await prisma.intentAudit.findMany({
    where: { intentId },
    orderBy: { createdAt: "asc" },
  });
  expect(audits.map((a) => [a.fromStatus, a.toStatus, a.actorType])).toEqual([
    ["DECLARED", "PENDING_APPROVAL", "policy"],
    ["PENDING_APPROVAL", "APPROVED", "human"],
    ["APPROVED", "EXECUTED", "agent"],
  ]);

  // ── Step 8: the raw key never appears in any later page load.
  for (const path of ["/agents", "/queue", "/history"]) {
    await page.goto(path);
    const body = await page.locator("body").innerText();
    expect(body, `raw key leaked on ${path}`).not.toContain(rawKey);
  }
});

test("denial path: an intent matching no rule fails closed", async ({ page, request }) => {
  const marker = `e2e-deny-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { rawKey } = await createAgentFixture(marker);

  // No rule matches "purge_database" — the fail-closed default applies.
  const summary = `${marker} purge everything`;
  const declared = await request.post("/api/intents", {
    headers: { "x-api-key": rawKey },
    data: { actionType: "purge_database", riskLevel: "CRITICAL", summary },
  });
  expect(declared.status()).toBe(201);
  const declaration = await declared.json();
  expect(declaration.status).toBe("DENIED");
  expect(declaration.verdict).toBe("DENY");
  expect(declaration.decidedBy).toBe("policy:default-deny");
  const intentId: string = declaration.id;

  await login(page);

  // A denied intent never enters the approval queue…
  await page.goto("/queue");
  await expect(page.locator(`[data-intent-id="${intentId}"]`)).toHaveCount(0);

  // …but the denial is visible in history, attributed to the default rule.
  await page.goto("/history?status=DENIED");
  const historyRow = page.locator(`[data-intent-id="${intentId}"]`);
  await expect(historyRow).toContainText("DENIED");
  await expect(historyRow).toContainText("policy:default-deny");

  // The agent cannot report an outcome against a denied intent.
  const reported = await request.post(`/api/intents/${intentId}/outcome`, {
    headers: { "x-api-key": rawKey },
    data: { outcome: "SUCCEEDED" },
  });
  expect(reported.status()).toBe(409);
  expect((await reported.json()).status).toBe("DENIED");

  const audits = await prisma.intentAudit.findMany({ where: { intentId } });
  expect(audits.map((a) => [a.fromStatus, a.toStatus, a.actorType])).toEqual([
    ["DECLARED", "DENIED", "policy"],
  ]);
});

test("expiry sweeper: a stale pending intent expires and rejects the outcome", async ({
  request,
}) => {
  const marker = `e2e-expire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { agent, rawKey } = await createAgentFixture(marker);
  await requireApprovalRule(agent.id, marker, "send_email");

  // Declared with a TTL already in the past — valid body, stale clock.
  const expiredAt = new Date(Date.now() - 1_000).toISOString();
  const declared = await request.post("/api/intents", {
    headers: { "x-api-key": rawKey },
    data: {
      actionType: "send_email",
      riskLevel: "MEDIUM",
      summary: `${marker} stale request`,
      expiresAt: expiredAt,
    },
  });
  expect(declared.status()).toBe(201);
  const declaration = await declared.json();
  expect(declaration.status).toBe("PENDING_APPROVAL");
  const intentId: string = declaration.id;

  // The cron endpoint fails closed: no secret, no sweep.
  expect((await request.get("/api/cron/expire")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/expire", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    ).status(),
  ).toBe(401);

  const run = await request.get("/api/cron/expire", {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  expect((await run.json()).expired).toBeGreaterThanOrEqual(1);

  const expired = await prisma.intent.findUniqueOrThrow({ where: { id: intentId } });
  expect(expired.status).toBe("EXPIRED");
  expect(expired.decidedBy).toBe("system:expiry-sweeper");

  // Declaration row plus the sweep — appended in order.
  const audits = await prisma.intentAudit.findMany({ where: { intentId } });
  expect(audits.map((a) => [a.fromStatus, a.toStatus, a.actorType])).toEqual([
    ["DECLARED", "PENDING_APPROVAL", "policy"],
    ["PENDING_APPROVAL", "EXPIRED", "system"],
  ]);
  const secondRun = await request.get("/api/cron/expire", {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(secondRun.status()).toBe(200);
  expect((await secondRun.json()).expired).toBe(0);

  // An agent reporting an outcome against an expired intent gets 409.
  const reported = await request.post(`/api/intents/${intentId}/outcome`, {
    headers: { "x-api-key": rawKey },
    data: { outcome: "SUCCEEDED" },
  });
  expect(reported.status()).toBe(409);
  expect((await reported.json()).status).toBe("EXPIRED");
});
