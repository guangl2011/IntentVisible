"use server";

import { revalidatePath } from "next/cache";
import { createAgentRecord } from "../../../lib/agent-management";
import { getPrisma } from "../../../lib/prisma";
import { hasDashboardSession } from "../../../lib/session";

export interface CreateAgentActionState {
  /** The raw API key — rendered exactly once, lost on the next navigation. */
  rawKey?: string;
  agentName?: string;
  error?: string;
}

/**
 * Create-agent server action. The raw key comes back as action state so the
 * form renders it once; nothing stores it — no cookie, no query string, no
 * re-fetchable value.
 */
export async function createAgentAction(
  _prev: CreateAgentActionState,
  formData: FormData,
): Promise<CreateAgentActionState> {
  if (!(await hasDashboardSession())) {
    return { error: "Your session expired — sign in again." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 100) {
    return { error: "Agent name must be 1–100 characters." };
  }

  const result = await createAgentRecord(getPrisma(), name);
  if (!result.ok) {
    return { error: `An agent named “${name}” already exists.` };
  }

  revalidatePath("/agents");
  return { rawKey: result.rawKey, agentName: result.agent.name };
}
