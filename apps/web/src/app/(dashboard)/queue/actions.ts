"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DASHBOARD_IDENTITY,
  humanActor,
} from "../../../lib/dashboard-auth";
import { decidePendingIntent } from "../../../lib/decision";
import { getPrisma } from "../../../lib/prisma";
import { hasDashboardSession } from "../../../lib/session";

/**
 * Queue decision server actions. These call the same decision core as the
 * HTTP decision endpoints (lib/decision.ts → conditional update + audit
 * insert in one transaction), so the state-machine guarantees — no path into
 * APPROVED except a human approval of a PENDING_APPROVAL row — hold for the
 * dashboard too. A 409-equivalent conflict (a parallel decision or the
 * sweeper moved the row first) redirects back with a notice, never a crash.
 */
export async function decideIntent(formData: FormData): Promise<void> {
  if (!(await hasDashboardSession())) {
    redirect("/login");
  }

  const intentId = String(formData.get("intentId") ?? "");
  const requested = String(formData.get("verdict") ?? "");
  const verdict = requested === "APPROVED" ? "APPROVED" : "DENIED";

  const result = await decidePendingIntent(getPrisma(), {
    intentId,
    verdict,
    actor: humanActor(DASHBOARD_IDENTITY),
    now: new Date(),
  });

  revalidatePath("/queue");
  if (!result.ok) {
    redirect(
      result.reason === "conflict"
        ? "/queue?notice=already-decided"
        : "/queue?notice=not-found",
    );
  }
  redirect("/queue");
}
