import { getPrisma } from "../../../lib/prisma";
import { authenticateAgent } from "../../../lib/agent-auth";
import {
  DeclareIntentBodySchema,
  mapEvaluation,
  persistDeclaration,
  resolveExpiresAt,
} from "../../../lib/declaration";
import { evaluate, type PolicyRule } from "../../../lib/policy";
import {
  isRateLimited,
  parseRateLimitConfig,
} from "../../../lib/rate-limit";

/**
 * POST /api/intents — the declaration API.
 *
 * Agent key auth (X-API-Key) → body validation (422) → per-key rate limit
 * (429) → deterministic policy evaluation → transactional intent + audit
 * persistence. Fail closed: an intent matching no policy rule is DENIED.
 */
export async function POST(request: Request): Promise<Response> {
  const prisma = getPrisma();

  const agent = await authenticateAgent(
    prisma,
    request.headers.get("x-api-key"),
  );
  if (!agent) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json_body" }, { status: 422 });
  }
  const parsed = DeclareIntentBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const now = new Date();
  if (await isRateLimited(prisma, agent.agent.id, parseRateLimitConfig(process.env), now)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  // Agent-scoped rules plus global (null-agent) rules; the engine applies
  // active/priority/wildcard semantics.
  const rules: PolicyRule[] = await prisma.policyRule.findMany({
    where: { active: true, OR: [{ agentId: agent.agent.id }, { agentId: null }] },
  });
  const evaluation = evaluate(rules, {
    agentId: agent.agent.id,
    actionType: parsed.data.actionType,
    riskLevel: parsed.data.riskLevel,
  });
  const decision = mapEvaluation(evaluation);

  try {
    const intent = await persistDeclaration(prisma, {
      agentId: agent.agent.id,
      actionType: parsed.data.actionType,
      riskLevel: parsed.data.riskLevel,
      summary: parsed.data.summary,
      payload: parsed.data.payload,
      status: decision.status,
      decidedBy: decision.decidedBy,
      expiresAt: resolveExpiresAt(now, parsed.data.expiresAt),
      now,
    });
    return Response.json(
      {
        id: intent.id,
        status: intent.status,
        verdict: evaluation.verdict,
        decidedBy: decision.decidedBy,
      },
      { status: 201 },
    );
  } catch (error) {
    // Surface, never swallow: the transaction rolled back, so nothing
    // partial was persisted; the client sees a plain 500.
    console.error("declaration persistence failed", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
