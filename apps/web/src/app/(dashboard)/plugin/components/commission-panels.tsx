import type { CommissionLedgerPayload } from "../../../../lib/plugin/types";
import { usd } from "./badges";

/**
 * Commission page panels (design v1.4 §2.5, Track A billing): the
 * per-order billing page — gross → refund offsets → net per order, with
 * the "every commission traces to a specific order number" promise
 * pinned at the top (the DeepLumen lesson, kept as a hard rule).
 */

const STATUS_BADGES: Record<CommissionLedgerPayload["per_order"][number]["status"], string> = {
  pending: "badge-PENDING_APPROVAL",
  confirmed: "badge-APPROVED",
  refunded: "badge-DENIED",
};

export function CommissionStats({ totals }: { totals: CommissionLedgerPayload["totals"] }) {
  return (
    <div className="stat-grid">
      <div className="stat">
        <span className="stat-value">{usd(totals.gross)}</span>
        <span className="muted">gross commission</span>
      </div>
      <div className="stat">
        <span className="stat-value">{usd(totals.refunds)}</span>
        <span className="muted">refund offsets</span>
      </div>
      <div className="stat">
        <span className="stat-value">{usd(totals.net)}</span>
        <span className="muted">net payable</span>
      </div>
    </div>
  );
}

export function PerOrderCommissionTable({ payload }: { payload: CommissionLedgerPayload }) {
  if (payload.per_order.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No attributed orders yet — nothing is billed.</strong>
        <p className="muted">
          Commission appears per order only after an order is attributed through the ledger. If traffic is
          arriving but orders are not, start with the Attribution page's Drop-off diagnosis rather than
          expecting billed rows.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Order</th>
          <th>Gross commission</th>
          <th>Refund offsets</th>
          <th>Net payable</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {payload.per_order.map((row) => (
          <tr key={row.order_id}>
            <td className="intent-id">{row.order_number}</td>
            <td>{usd(row.gross_commission)}</td>
            <td>{usd(row.refund_offsets)}</td>
            <td>{usd(row.net_commission)}</td>
            <td>
              <span className={`badge ${STATUS_BADGES[row.status]}`}>{row.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CommissionEntriesTable({ payload }: { payload: CommissionLedgerPayload }) {
  if (payload.entries.length === 0) {
    return null;
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Entry</th>
          <th>Order</th>
          <th>Intent</th>
          <th>Channel</th>
          <th>Tracking code</th>
          <th>Billed period</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {payload.entries.map((row) => (
          <tr key={row.entry_id}>
            <td>{row.entry_id}</td>
            <td className="intent-id">{row.order_number}</td>
            <td>{row.intent_id ?? <span className="muted">—</span>}</td>
            <td>{row.channel}</td>
            <td>{row.tracking_code ?? <span className="muted">—</span>}</td>
            <td>
              {row.billed_period_start} → {row.billed_period_end}
            </td>
            <td>{row.entry.entry_type === "commission" ? "commission" : "refund offset"}</td>
            <td>{usd(row.entry.amount)}</td>
            <td>
              <span className={`badge ${STATUS_BADGES[row.entry.status]}`}>{row.entry.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CommissionPanels({ payload }: { payload: CommissionLedgerPayload }) {
  return (
    <>
      <div className="card notice">
        <strong>Every commission traces to a specific order number and reconciles against Shopify.</strong>{" "}
        <span className="muted">
          Billing basis is net sales (order value minus refunds), at the tiered 5–20% rate — free install,
          performance-only billing.
        </span>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>Billing summary</h3>
        </div>
        <CommissionStats totals={payload.totals} />
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>Per-order reconciliation</h3>
        </div>
        <p className="muted">
          Gross commission, refund offsets (credits back — never destructive edits), and net payable per
          order. {payload.unbilled_order_ids.length} unattributed order(s) are deliberately never billed.
        </p>
        <PerOrderCommissionTable payload={payload} />
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>Ledger entries</h3>
        </div>
        <CommissionEntriesTable payload={payload} />
      </div>
    </>
  );
}
