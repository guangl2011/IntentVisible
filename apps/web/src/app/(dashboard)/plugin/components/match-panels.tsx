import type { MatchPayload } from "../../../../lib/plugin/types";
import { usd } from "./badges";

/**
 * Intent Match panels (design v1.4 §2.5): affiliate visits with their
 * channel/partner splits and the settlement gate — settlement derived
 * only from provider_measured data, so simulated fixture data shows the
 * withheld state with its reason, never a computed number.
 */

export function AffiliateVisitsTable({ payload }: { payload: MatchPayload }) {
  if (payload.affiliate_visits.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No affiliate visits yet.</strong>
        <p className="muted">
          Visits land here when Intent Match sends external affiliate traffic (Play / Ads channels) to your
          intent pages, with UTM / tracking-code provenance preserved.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
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
              {visit.order_number ?? <span className="muted">no order yet</span>}
            </td>
            <td>{visit.landed_at.slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChannelPartnerPanels({ payload }: { payload: MatchPayload }) {
  return (
    <>
      <div className="card">
        <div className="intent-head">
          <h3>By channel</h3>
        </div>
        <ChannelPartnerTable rows={payload.by_channel.map((row) => ({ key: row.channel, ...row }))} />
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>By partner</h3>
        </div>
        <ChannelPartnerTable rows={payload.by_partner.map((row) => ({ key: row.partner, ...row }))} />
      </div>
    </>
  );
}

function ChannelPartnerTable({ rows }: { rows: { key: string; visits: number; orders: number }[] }) {
  if (rows.length === 0) {
    return <p className="muted">No affiliate traffic recorded in this window.</p>;
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Visits</th>
          <th>Orders</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.key}</td>
            <td>{row.visits}</td>
            <td>{row.orders}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
        <p>
          Settlement is not shown for this data: {settlement.reason}
        </p>
        <p className="muted">
          This is the honest state for simulated data — settlement numbers derived from simulated sessions
          would be fiction. The Commission page still shows the ledger with its data mode labeled.
        </p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="intent-head">
        <h3>Settlement per tracking code</h3>
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

export function MatchPanels({ payload }: { payload: MatchPayload }) {
  return (
    <>
      <div className="card">
        <div className="intent-head">
          <h3>Intent Affiliate Visits</h3>
        </div>
        <p className="muted">
          External affiliate traffic Intent Match brings in: sessions from Play and Ads channels and partner
          placements, joined to orders through the same tracking-code system the Commission page bills on.
        </p>
        <AffiliateVisitsTable payload={payload} />
      </div>
      <ChannelPartnerPanels payload={payload} />
      <SettlementPanel settlement={payload.settlement} />
    </>
  );
}
