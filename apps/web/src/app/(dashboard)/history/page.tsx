import Link from "next/link";
import type { IntentStatus, RiskLevel } from "@prisma/client";
import { getPrisma } from "../../../lib/prisma";
import { IntentCard } from "../intent-card";

const PAGE_SIZE = 50;

const STATUSES: readonly (IntentStatus | "ALL")[] = [
  "ALL",
  "PENDING_APPROVAL",
  "APPROVED",
  "DENIED",
  "EXPIRED",
  "EXECUTED",
  "FAILED",
];

const RISKS: readonly (RiskLevel | "ALL")[] = [
  "ALL",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

interface HistoryFilters {
  status: IntentStatus | "ALL";
  agentId: string | "ALL";
  riskLevel: RiskLevel | "ALL";
  cursor?: string;
}

/**
 * Filter values arrive from the URL, i.e. from users. Anything that is not a
 * real enum member falls back to ALL rather than reaching Prisma and throwing.
 */
function parseFilters(
  params: Record<string, string | string[] | undefined>,
): HistoryFilters {
  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = one("status");
  const risk = one("riskLevel");
  const agentId = one("agentId");
  const cursor = one("cursor");

  return {
    status: STATUSES.find((s) => s === status) ?? "ALL",
    riskLevel: RISKS.find((r) => r === risk) ?? "ALL",
    agentId: agentId && agentId !== "ALL" ? agentId : "ALL",
    cursor,
  };
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const prisma = getPrisma();

  const agents = await prisma.agent.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const intents = await prisma.intent.findMany({
    where: {
      ...(filters.status !== "ALL" ? { status: filters.status } : {}),
      ...(filters.riskLevel !== "ALL" ? { riskLevel: filters.riskLevel } : {}),
      ...(filters.agentId !== "ALL" ? { agentId: filters.agentId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: { agent: { select: { name: true } } },
  });

  const hasMore = intents.length > PAGE_SIZE;
  const page = hasMore ? intents.slice(0, PAGE_SIZE) : intents;
  const lastId = page[page.length - 1]?.id;

  const olderHref = lastId
    ? `/history?status=${filters.status}&riskLevel=${filters.riskLevel}&agentId=${filters.agentId}&cursor=${lastId}`
    : null;

  return (
    <div>
      <h1 className="page-title">Intent history</h1>

      <form method="get" className="form-grid">
        <label className="field">
          Status
          <select name="status" defaultValue={filters.status}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Agent
          <select name="agentId" defaultValue={filters.agentId}>
            <option value="ALL">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Risk
          <select name="riskLevel" defaultValue={filters.riskLevel}>
            {RISKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary">
          Apply filters
        </button>
      </form>

      {page.length === 0 ? (
        <p className="muted">No intents match these filters.</p>
      ) : (
        page.map((intent) => (
          <IntentCard
            key={intent.id}
            intent={{ ...intent, agentName: intent.agent.name }}
          />
        ))
      )}

      <div className="pager">
        <span />
        {hasMore && olderHref ? <Link href={olderHref}>Older →</Link> : null}
      </div>
    </div>
  );
}
