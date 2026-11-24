"use client";

import { BILLING_PLAN } from "../../../../lib/plugin/demo-fixtures";
import { usd } from "../components/badges";
import { BlindSpotFooter, SourceLabel } from "../components/red-lines";

/**
 * Billing (design v1.4 §2.6): the settings billing summary — Track A
 * commission rates and windows always visible, Track B shown as the
 * Phase II stub it is. Per-effect detail lives on the Commission page.
 */
export default function BillingPage() {
  return (
    <>
      <h1>Billing</h1>
      <p className="muted">
        Free install, pay only for performance. Rates and reconciliation windows are always visible here —
        nothing about billing is a black box.
      </p>

      <div className="card" data-testid="billing-plan">
        <div className="intent-head">
          <h3>Plan</h3>
        </div>
        <p>
          <strong>{BILLING_PLAN.plan}</strong> — {BILLING_PLAN.note}
        </p>
        <p className="muted">{BILLING_PLAN.summary}</p>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>Track A — order-attribution commission</h3>
          <SourceLabel kind="measured" />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Rate band</th>
              <th>Gross commission</th>
              <th>Refund offsets</th>
              <th>Net billed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {(BILLING_PLAN.track_a_rate_band.min * 100).toFixed(0)}–
                {(BILLING_PLAN.track_a_rate_band.max * 100).toFixed(0)}% (tiered by category / partner level)
              </td>
              <td>{usd(BILLING_PLAN.track_a_totals.gross)}</td>
              <td>{usd(BILLING_PLAN.track_a_totals.refunds)}</td>
              <td>{usd(BILLING_PLAN.track_a_totals.net)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted">
          Billing basis: net sales, never gross. The per-order ledger — with the
          每笔佣金都可对应到具体订单号 promise — lives in Intent Match ▸ Commission.
        </p>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>Track B — ad-optimization effect fee</h3>
          <span className="badge badge-not-measured">Phase II stub</span>
        </div>
        <p className="muted">
          Effect fees bill only after a verified baseline exists (pre-period window, or a holdout comparison
          where the merchant accepts it). The baseline method will be published here before the first effect
          fee is ever charged.
        </p>
      </div>

      <BlindSpotFooter
        items={[
          "Phase I billing totals cover attributed orders only — unattributed orders are never billed.",
          "Tier assignments per category / partner level are not finalized (design open question #4).",
        ]}
      />
    </>
  );
}
