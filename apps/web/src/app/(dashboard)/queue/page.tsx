import { getPrisma } from "../../../lib/prisma";
import { IntentCard } from "../intent-card";
import { decideIntent } from "./actions";
import { QueueRefresher } from "./queue-refresher";

/**
 * Approval queue: every PENDING_APPROVAL intent, newest first. Approve/deny
 * post to a server action that reuses the decision API's conditional-update
 * core; the page revalidates after every decision. 15s polling keeps the
 * queue current without websockets.
 */
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const prisma = getPrisma();

  const pending = await prisma.intent.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { agent: { select: { name: true } } },
  });

  return (
    <div>
      <QueueRefresher />
      <h1 className="page-title">Approval queue</h1>

      {notice === "already-decided" ? (
        <p className="notice" role="alert">
          That intent was already decided — the queue has been refreshed.
        </p>
      ) : null}
      {notice === "not-found" ? (
        <p className="notice" role="alert">
          That intent no longer exists — the queue has been refreshed.
        </p>
      ) : null}

      {pending.length === 0 ? (
        <p className="muted">No intents are waiting for approval.</p>
      ) : (
        pending.map((intent) => (
          <IntentCard
            key={intent.id}
            intent={{ ...intent, agentName: intent.agent.name }}
          >
            <div className="row-actions">
              <form action={decideIntent}>
                <input type="hidden" name="intentId" value={intent.id} />
                <input type="hidden" name="verdict" value="APPROVED" />
                <button type="submit" className="primary">
                  Approve
                </button>
              </form>
              <form action={decideIntent}>
                <input type="hidden" name="intentId" value={intent.id} />
                <input type="hidden" name="verdict" value="DENIED" />
                <button type="submit" className="danger">
                  Deny
                </button>
              </form>
            </div>
          </IntentCard>
        ))
      )}
    </div>
  );
}
