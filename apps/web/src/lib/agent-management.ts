import { randomBytes } from "node:crypto";
import type { Agent, PrismaClient } from "@prisma/client";
import { hashApiKey } from "./agent-auth";

/**
 * Agent management core for the dashboard. The raw API key exists only as
 * the return value here — the database keeps the sha256 hash and an 8-char
 * prefix, so the one-time reveal on the agents page is the last time the
 * raw key is ever visible.
 */

export type CreateAgentResult =
  | { ok: true; agent: Agent; rawKey: string }
  | { ok: false; reason: "duplicate_name" };

export async function createAgentRecord(
  prisma: PrismaClient,
  name: string,
): Promise<CreateAgentResult> {
  const existing = await prisma.agent.findUnique({ where: { name } });
  if (existing) return { ok: false, reason: "duplicate_name" };

  // Mirror the declaration API's fail-closed posture: a losing race against
  // a concurrent create with the same name surfaces as a named error.
  const rawKey = `ivk_${randomBytes(24).toString("hex")}`;
  try {
    const agent = await prisma.agent.create({
      data: {
        name,
        keyHash: hashApiKey(rawKey),
        keyPrefix: rawKey.slice(0, 8),
      },
    });
    return { ok: true, agent, rawKey };
  } catch (error) {
    // PrismaClientKnownRequestError P2002 = unique-constraint violation, i.e.
    // a concurrent create won the same-name race.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { ok: false, reason: "duplicate_name" };
    }
    throw error;
  }
}
