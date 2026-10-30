import type { PrismaClient } from "@prisma/client";

/**
 * Minimal per-key rate limiting: the count of intents the agent already
 * created inside a rolling window, enforced against the same Postgres as
 * everything else. No extra infrastructure in v1 — the contract's criterion
 * is only that unbounded flooding is rejected. Concurrent declarations can
 * race past the count by a small margin; that is acceptable at this bar and
 * the sweeper keeps the counted set bounded via expiry.
 */
export interface RateLimitConfig {
  /** Maximum intents per window. Unlimited when null (feature off). */
  max: number | null;
  windowMs: number;
}

export const RATE_LIMIT_MAX_ENV = "RATE_LIMIT_MAX";
export const RATE_LIMIT_WINDOW_SECONDS_ENV = "RATE_LIMIT_WINDOW_SECONDS";

/** Read config from an env-like record. Invalid or zero/negative max disables. */
export function parseRateLimitConfig(env: Record<string, string | undefined>): RateLimitConfig {
  const rawMax = env[RATE_LIMIT_MAX_ENV];
  const max = rawMax === undefined ? null : Number.parseInt(rawMax, 10);
  const rawWindow = env[RATE_LIMIT_WINDOW_SECONDS_ENV];
  const windowSeconds =
    rawWindow === undefined ? 60 : Number.parseInt(rawWindow, 10);

  const windowMs = Math.max(1, windowSeconds) * 1000;
  return { max: max !== null && Number.isFinite(max) && max > 0 ? max : null, windowMs };
}

/**
 * True when the agent has reached `max` intents within the window ending at
 * `now`. `now` is an argument so tests control the clock explicitly.
 */
export async function isRateLimited(
  prisma: PrismaClient,
  agentId: string,
  config: RateLimitConfig,
  now: Date,
): Promise<boolean> {
  if (config.max === null) return false;
  const windowStart = new Date(now.getTime() - config.windowMs);
  const recent = await prisma.intent.count({
    where: { agentId, createdAt: { gte: windowStart } },
  });
  return recent >= config.max;
}
