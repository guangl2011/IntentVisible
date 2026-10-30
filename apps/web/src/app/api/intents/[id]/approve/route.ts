import { handleDecisionRequest } from "../../../../../lib/decision";

/**
 * POST /api/intents/[id]/approve — human approval of a pending intent.
 * Semantics live in lib/decision.ts so approve and deny share one code path.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleDecisionRequest(request, context, "APPROVED");
}
