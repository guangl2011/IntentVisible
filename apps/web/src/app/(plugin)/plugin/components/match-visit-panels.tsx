"use client";

import Link from "next/link";

import type { MatchPayload } from "../../../../lib/plugin/types";
import { usd } from "./badges";
import { SourceLabel } from "./red-lines";

/**
 * Intent Match visit + settlement panels (design v1.4 §2.5), exported
 * for unit tests: the affiliate-visit table (channel / partner /
 * tracking-code provenance, order linkage) and the settlement gate that
 * computes only over provider_measured data.
 */

export function AffiliateVisitsPanel({ payload }: { payload: MatchPayload }) {
  return (
    <div className="card">
      <div className="intent-head">
        <h3>Affiliate visits by channel / partner / intent</h3>
        <SourceLabel kind="measured" />
      </div>
      {payload.affiliate_visits.length === 0 ? (
        <p className="muted">
          No affiliate visits yet — visits land here when Intent Match channels send external traffic to
          your intent pages.
        </p>
      ) : (
        <table className="table" data-testid="affiliate-visit-table">
          <thead>
            <tr>
              <th>Visit</th>
              <th>Channel</th>
              <th>Partner</th>
              <th>Tracking code</th>
              <th>Landed intent</th>
              <th>Order</th>
              <th>Landed at</th>
            </tr>
          </thead>
          <tbody>
            {payload.affiliate_visits.map((visit) => (
              <tr key={visit.visit_id}>
                <td className="intent-id">{visit.visit_id}</td>
                <td>{visit.channel}</td>
                <td>{visit.partner}</td>
                <td className="mono">{visit.tracking_code}</td>
                <td>{visit.landed_intent_id ?? <span className="muted">no intent page</span>}</td>
                <td>
                  {visit.order_number ?? (
                    <Link href="/plugin/attribution#channel-quality">no order yet — diagnose</Link>
                  )}
                </td>
                <td>{visit.landed_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">
        Visit → order → commission: every visit row joins to the Commission page through the tracking code —{" "}
        <Link href="/plugin/commission">open the commission ledger</Link>.
      </p>
    </div>
  );
}

/** The settlement gate: computed only over provider_measured data. */
export function SettlementPanel({ settlement }: { settlement: MatchPayload["settlement"] }) {
  if (settlement.status === "withheld") {
    return (
      <div className="card failure-card">
        <div className="intent-head">
          <h3>Settlement — withheld</h3>
        </div>
        <p>Settlement is not shown for this data: {settlement.reason}</p>
        <p className="muted">
          Settlement computes only over provider_measured data — numbers derived from simulated sessions
          would be fiction. The Commission page still shows the ledger with its data mode labeled.
        </p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="intent-head">
        <h3>Settlement per tracking code</h3>
        <SourceLabel kind="measured" />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Tracking code</th>
            <th>Gross</th>
            <th>Refunds</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {settlement.per_tracking_code.map((row) => (
            <tr key={row.tracking_code}>
              <td className="mono">{row.tracking_code}</td>
              <td>{usd(row.gross)}</td>
              <td>{usd(row.refunds)}</td>
              <td>{usd(row.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
