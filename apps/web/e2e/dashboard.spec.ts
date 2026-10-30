import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { hashApiKey } from "../src/lib/agent-auth";
import { E2E_DATABASE_URL, E2E_PASSCODE } from "./config-url";

/**
 * Dashboard checks (the full agent-facing e2e journey belongs to the e2e
 * subtask). Seeding goes through Prisma directly with unique names because
 * these tests share the dev database; assertions scope by those names.
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

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("queue: acting on a pending intent decides it and revalidates the page", async ({
  page,
}) => {
  const marker = `e2e-queue-${Date.now()}`;
  const agentName = `${marker}-agent`;
  const agent = await prisma.agent.create({
    data: {
      name: agentName,
      keyHash: hashApiKey(`ivt_${marker}`),
      keyPrefix: `ivt_${marker}`.slice(0, 8),
    },
  });
  const intent = await prisma.intent.create({
    data: {
      agentId: agent.id,
      actionType: "send_email",
      riskLevel: "HIGH",
      summary: marker,
      status: "PENDING_APPROVAL",
      decidedBy: "policy:e2e-rule",
      decidedAt: new Date(0),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  // Mirror the declaration path's initial audit row so the count assertion
  // below reflects declaration → approval.
  await prisma.intentAudit.create({
    data: {
      intentId: intent.id,
      fromStatus: "DECLARED",
      toStatus: "PENDING_APPROVAL",
      actor: "policy:e2e-rule",
      actorType: "policy",
    },
  });

  await login(page);
  await page.goto("/queue");

  const row = page.locator(`[data-intent-id="${intent.id}"]`);
  await expect(row).toContainText(marker);

  await row.getByRole("button", { name: "Approve" }).click();

  // The decision POSTed, the page revalidated, and the row left the queue.
  await expect(page.locator(`[data-intent-id="${intent.id}"]`)).toHaveCount(0);

  // The decision is real: the intent is APPROVED in history with an actor.
  await page.goto("/history?status=APPROVED");
  const historyEntry = page.locator(`[data-intent-id="${intent.id}"]`);
  await expect(historyEntry).toContainText("APPROVED");
  await expect(historyEntry).toContainText("human:dashboard");

  // No duplicate audit row from the UI path.
  const audits = await prisma.intentAudit.findMany({
    where: { intentId: intent.id },
  });
  expect(audits).toHaveLength(2); // declaration → approval
});

test("agents: the raw API key is shown exactly once", async ({ page }) => {
  const agentName = `e2e-key-${Date.now()}`;

  await login(page);
  await page.goto("/agents");

  await page.getByLabel("Agent name").fill(agentName);
  await page.getByRole("button", { name: "Create agent" }).click();

  const reveal = page.getByTestId("raw-api-key");
  await expect(reveal).toBeVisible();
  const rawKey = (await reveal.textContent()) ?? "";
  expect(rawKey).toMatch(/^ivk_[0-9a-f]{48}$/);

  // The stored record keeps only the hash + prefix.
  const stored = await prisma.agent.findUniqueOrThrow({
    where: { name: agentName },
  });
  expect(stored.keyHash).toBe(hashApiKey(rawKey));
  expect(stored.keyPrefix).toBe(rawKey.slice(0, 8));

  // Reload: the key is gone from every later render of the page.
  await page.reload();
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(rawKey);
});
