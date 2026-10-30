import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "../../../../lib/prisma";
import { expireStaleIntents } from "../../../../lib/sweeper";

/**
 * Shared-secret auth for the cron endpoint. Fail closed: with no CRON_SECRET
 * configured nothing is ever expired via HTTP. Length check runs before
 * timingSafeEqual because the latter throws on mismatched lengths.
 */
export function isAuthorizedCronRequest(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request, process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await expireStaleIntents(getPrisma(), new Date());
  return Response.json(result, { status: 200 });
}
