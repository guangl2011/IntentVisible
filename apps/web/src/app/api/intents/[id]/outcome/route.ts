import { handleOutcomeRequest } from "../../../../../lib/outcome";

/**
 * POST /api/intents/[id]/outcome — the owning agent reports the executed
 * action's result. Semantics live in lib/outcome.ts.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleOutcomeRequest(request, context);
}
