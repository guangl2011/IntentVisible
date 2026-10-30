import { createHash } from "node:crypto";
import type { Agent, PrismaClient } from "@prisma/client";

/**
 * Per-agent API key auth for the declaration API.
 *
 * Keys are stored only as sha256 hashes (Agent.keyHash); the raw key exists
 * solely at creation time and in the agent's own config. Lookup is by hash,
 * so a database leak reveals nothing usable.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export interface AgentAuthResult {
  agent: Agent;
  /** The raw key the caller presented, for optional header echo/debugging. */
  rawKey: string;
}

/**
 * Authenticate an X-API-Key header against Agent rows. Returns null for a
 * missing header, an unknown key, or an inactive agent — the route maps all
 * of these to 401 so probing can't distinguish the cases.
 */
export async function authenticateAgent(
  prisma: PrismaClient,
  rawKey: string | null,
): Promise<AgentAuthResult | null> {
  if (!rawKey || rawKey.length === 0) return null;

  const agent = await prisma.agent.findUnique({
    where: { keyHash: hashApiKey(rawKey) },
  });
  if (!agent || !agent.active) return null;

  return { agent, rawKey };
}
