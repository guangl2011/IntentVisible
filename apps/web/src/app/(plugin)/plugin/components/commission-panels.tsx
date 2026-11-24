"use client";

import { useMemo, useState } from "react";

import type { CommissionLedgerPayload, PerOrderReconciliation } from "../../../../lib/plugin/types";
import { COMMISSION_DEMO_COLUMNS } from "../../../../lib/plugin/demo-fixtures";
import { usd } from "./badges";
import { EmptyWithWhy, SimulatedLabel, SourceLabel } from "./red-lines";
import { useT } from "../../../../lib/plugin/i18n/locale";

/**
 * Commission page panels (design v1.4 §2.5, Track A billing): the
 * per-order billing page — filter bar, four stat cards, and the
 * order-level table with the DeepLumen-parity column set. The pinned
 * promise line ("every commission traces to a specific order number
 * and reconciles against Shopify") stays at the top; the DeepLumen
 * lesson is kept as a hard rule.
 */

const STATUS_BADGES: Record<PerOrderReconciliation["status"], string> = {
  pending: "badge-PENDING_APPROVAL",
  confirmed: "badge-APPROVED",
  refunded: "badge-DENIED",
};

/** Pure helper: attribution summary strings for one order, from its entries. */
function orderAttribution(payload: CommissionLedgerPayload, orderId: string): string {
  const entries = payload.entries.filter((entry) => entry.order_id === orderId);
  const first = entries[0];
  if (first === undefined) return "not_measured";
  const parts = [first.intent_id ?? "no intent", first.channel, first.tracking_code ?? "no tracking code"];
  return parts.join(" · ");
}

/** Pure helper: billed period for one order, from its entries. */
function orderBilledPeriod(payload: CommissionLedgerPayload, orderId: string): string | null {
  const first = payload.entries.find((entry) => entry.order_id === orderId);
  if (first === undefined) return null;
  return `${first.billed_period_start} → ${first.billed_period_end}`;
}

/** Pure helper: applied commission rate from an entry's base when present. */
function orderRate(payload: CommissionLedgerPayload, orderId: string): number | null {
  const entry = payload.entries.find(
    (candidate) => candidate.order_id === orderId && candidate.entry.base_amount !== undefined,
  );
  if (entry === undefined || entry.entry.base_amount === undefined || entry.entry.base_amount === 0) {
    return null;
  }
  return (entry.entry.amount / entry.entry.base_amount) * 100;
}

/** Pure helper: which distinct channels the attributed orders arrived through. */
function distinctChannels(payload: CommissionLedgerPayload): string[] {
  return [...new Set(payload.entries.map((entry) => entry.channel))];
}

/** Pure helper: filter rows by the §2.5 filter-bar state. */
function filterRows(
  payload: CommissionLedgerPayload,
  filters: { search: string; status: string; channel: string },
): PerOrderReconciliation[] {
  return payload.per_order.filter((row) => {
    const channel = orderAttribution(payload, row.order_id);
    if (filters.search !== "" && !row.order_number.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.channel !== "all" && !channel.includes(filters.channel)) return false;
    return true;
  });
}

/** Pure helper: the §2.5 Export CSV over the currently filtered rows. */
function commissionCsv(payload: CommissionLedgerPayload, rows: PerOrderReconciliation[]): string {
  const header = [
    "Order",
    "Order date",
    "Billed period",
    "Attribution",
    "Order total",
    "Rate",
    "Billed commission (USD)",
    "Status",
  ];
  const lines = rows.map((row) => {
    const rate = orderRate(payload, row.order_id);
    const cells = [
      row.order_number,
      COMMISSION_DEMO_COLUMNS.orderDates[row.order_number] ?? "not_measured",
      orderBilledPeriod(payload, row.order_id) ?? "not_measured",
      orderAttribution(payload, row.order_id),
      String(COMMISSION_DEMO_COLUMNS.orderTotals[row.order_number] ?? "not_measured"),
      rate === null ? "not_measured" : `${rate.toFixed(0)}%`,
      row.net_commission.toFixed(2),
      row.status,
    ];
    return cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}

/** The §2.5 filter bar: order search, status, attribution channel, export. */
function CommissionFilterBar({
  payload,
  filters,
  setFilters,
}: {
  payload: CommissionLedgerPayload;
  filters: { search: string; status: string; channel: string };
  setFilters: (next: { search: string; status: string; channel: string }) => void;
}) {
  const t = useT().commission.filter;
  const rows = filterRows(payload, filters);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(commissionCsv(payload, rows))}`;
  return (
    <div className="commission-filterbar" data-testid="commission-filterbar">
      <input
        type="search"
        aria-label={t.searchLabel}
        placeholder={t.searchPlaceholder}
        value={filters.search}
        onChange={(event) => setFilters({ ...filters, search: event.target.value })}
      />
      <select
        aria-label={t.dateRangeLabel}
        value="since"
        onChange={() => undefined}
      >
        <option value="since">{t.sinceCommissionStarted}</option>
      </select>
      <select
        aria-label={t.statusLabel}
        value={filters.status}
        onChange={(event) => setFilters({ ...filters, status: event.target.value })}
      >
        <option value="all">{t.all}</option>
        <option value="pending">pending</option>
        <option value="confirmed">confirmed</option>
        <option value="refunded">refunded</option>
      </select>
      <select
        aria-label={t.attributionLabel}
        value={filters.channel}
        onChange={(event) => setFilters({ ...filters, channel: event.target.value })}
      >
        <option value="all">{t.allChannels}</option>
        {distinctChannels(payload).map((channel) => (
          <option key={channel} value={channel}>
            {channel}
          </option>
        ))}
      </select>
      <a className="commission-export" href={csvHref} download="commission-ledger.csv">
        {t.export}
      </a>
    </div>
  );
}

/** The four §2.5 stat cards. */
function CommissionStatCards({ payload }: { payload: CommissionLedgerPayload }) {
  const t = useT().commission;
  const channels = distinctChannels(payload);
  return (
    <div className="stat-grid stat-grid-four">
      <div className="stat">
        <span className="stat-value">{payload.per_order.length}</span>
        <span className="muted">{t.statAllOrders}</span> <SourceLabel kind="measured" />
      </div>
      <div className="stat">
        <span className="stat-value">{channels.length}</span>
        <span className="muted">{t.statChannels(channels.join(", ") || "")}</span>{" "}
        <SourceLabel kind="attribution_model" />
      </div>
      <div className="stat">
        <span className="stat-value">{usd(payload.totals.net)}</span>
        <span className="muted">{t.statNet}</span> <SourceLabel kind="measured" />
      </div>
      <div className="stat">
        <span className="stat-value">{usd(payload.totals.refunds)}</span>
        <span className="muted">{t.statRefunds}</span> <SourceLabel kind="measured" />
      </div>
    </div>
  );
}

/** The §2.5 order-level table with the DeepLumen-parity column set. */
export function CommissionOrderTable({ payload }: { payload: CommissionLedgerPayload }) {
  const t = useT();
  const [filters, setFilters] = useState({ search: "", status: "all", channel: "all" });
  const rows = filterRows(payload, filters);

  if (payload.per_order.length === 0) {
    return (
      <EmptyWithWhy
        title={t.commission.empty.title}
        hint={t.commission.empty.hint}
        why={t.commission.empty.why}
      />
    );
  }

  return (
    <>
      <CommissionFilterBar payload={payload} filters={filters} setFilters={setFilters} />
      {rows.length === 0 ? (
        <EmptyWithWhy
          title={t.commission.noMatch.title}
          hint={t.commission.noMatch.hint}
          why={t.commission.noMatch.why}
        />
      ) : (
        <table className="table" data-testid="commission-order-table">
          <thead>
            <tr>
              <th>{t.commission.headers.order}</th>
              <th>
                {t.commission.headers.orderDate} <SimulatedLabel what="demo dates" />
              </th>
              <th>{t.commission.headers.billedPeriod}</th>
              <th>
                {t.commission.headers.attribution} <SourceLabel kind="attribution_model" />
              </th>
              <th>
                {t.commission.headers.orderTotal} <SimulatedLabel what="demo totals" />
              </th>
              <th>{t.commission.headers.rate}</th>
              <th>
                {t.commission.headers.billedCommission} <SourceLabel kind="measured" />
              </th>
              <th>{t.commission.headers.status}</th>
              <th>{t.commission.headers.details}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rate = orderRate(payload, row.order_id);
              const total = COMMISSION_DEMO_COLUMNS.orderTotals[row.order_number];
              const date = COMMISSION_DEMO_COLUMNS.orderDates[row.order_number];
              return (
                <tr key={row.order_id}>
                  <td className="intent-id">{row.order_number}</td>
                  <td>{date ?? <span className="badge badge-not-measured">not measured</span>}</td>
                  <td>{orderBilledPeriod(payload, row.order_id) ?? "—"}</td>
                  <td className="commission-attribution">{orderAttribution(payload, row.order_id)}</td>
                  <td>
                    {total === undefined ? (
                      <span className="badge badge-not-measured">not measured</span>
                    ) : (
                      usd(total)
                    )}
                  </td>
                  <td>
                    {rate === null ? (
                      <span className="badge badge-not-measured">not measured</span>
                    ) : (
                      `${rate.toFixed(0)}%`
                    )}
                  </td>
                  <td>
                    <strong>{usd(row.net_commission)}</strong>
                    <span className="muted">
                      {" "}
                      (gross {usd(row.gross_commission)} − offsets {usd(row.refund_offsets)})
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGES[row.status]}`}>{row.status}</span>
                  </td>
                  <td>
                    <details>
                      <summary>{t.commission.entries}</summary>
                      <ul className="commission-entry-detail">
                        {payload.entries
                          .filter((entry) => entry.order_id === row.order_id)
                          .map((entry) => (
                            <li key={entry.entry_id}>
                              {entry.entry.entry_type === "commission" ? "commission" : "refund offset"}:{" "}
                              {usd(entry.entry.amount)} · {entry.entry.status} ·{" "}
                              {entry.billed_period_start} → {entry.billed_period_end}
                            </li>
                          ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted">{t.commission.statusNote(payload.unbilled_order_ids.length)}</p>
    </>
  );
}

export function CommissionPanels({ payload }: { payload: CommissionLedgerPayload }) {
  const t = useT();
  const promise = useMemo(
    () => (
      <div className="card notice" data-testid="commission-promise">
        <strong>{t.commission.promise}</strong>{" "}
        <span className="muted">{t.commission.promiseNote}</span>
      </div>
    ),
    [t],
  );

  return (
    <>
      {promise}
      <div className="card">
        <div className="intent-head">
          <h3>{t.commission.billingSummaryTitle}</h3>
        </div>
        <CommissionStatCards payload={payload} />
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>{t.commission.ledgerTitle}</h3>
        </div>
        <CommissionOrderTable payload={payload} />
      </div>
    </>
  );
}
