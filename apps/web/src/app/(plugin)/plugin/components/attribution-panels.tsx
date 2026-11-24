"use client";

import type {
  AttributionPayload,
  ChannelQualityRow,
  DemandGapRow,
  FunnelRow,
  IntentYieldRow,
  OpportunityScoreRow,
} from "../../../../lib/plugin/types";
import { SourceLabel } from "./red-lines";

import { useT } from "../../../../lib/plugin/i18n/locale";

import { EstimatedBadge, VisibilityProvenanceBadge, bucketLabel, usd } from "./badges";

/**
 * Attribution panels (design v1.4 §1.8, §2.3): the intent correlation
 * model. Red lines carried into the markup: demand stays tier-only (an
 * estimated tier, never an invented search volume), numeric coverage is
 * withheld with an explanation rather than fabricated, and every
 * Opportunity Score wears the estimated badge.
 */

export function IntentYieldTable({ rows }: { rows: IntentYieldRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No attributed orders yet.</strong>
        <p className="muted">
          Intent Yield fills in as commission-ledger entries link orders to intents. Until then this is a
          real empty state, not a missing table.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Intent</th>
          <th>Orders</th>
          <th>Gross sales</th>
          <th>Refunded</th>
          <th>Net sales</th>
          <th>Share of attributed orders</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.intent_id}>
            <td>{row.intent_name}</td>
            <td>{row.orders}</td>
            <td>{usd(row.gross_sales)}</td>
            <td>{usd(row.refunded_sales)}</td>
            <td>{usd(row.net_sales)}</td>
            <td>{(row.share_of_attributed_orders * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DemandGapTable({ rows }: { rows: DemandGapRow[] }) {
  const t = useT();
  if (rows.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No demand comparison yet.</strong>
        <p className="muted">
          Demand Gap compares estimated market demand with measured on-site traffic per intent. It appears
          once intents carry visibility measurements.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Intent</th>
          <th>Demand (estimated tier)</th>
          <th>Visibility</th>
          <th>Gap</th>
          <th>Bucket</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.intent_id}>
            <td>{row.intent_id}</td>
            <td>
              {row.demand.basis === "not_measured" ? (
                <span className="muted">not measured — no tier is invented</span>
              ) : (
                <>
                  {row.demand.tier} <span className="badge badge-estimated">{row.demand.basis}</span>
                </>
              )}
            </td>
            <td>
              {row.visibility_provenance === null ? (
                <span className="badge badge-not-measured">not measured</span>
              ) : (
                <VisibilityProvenanceBadge
                  visibility={{
                    measurement_status: "measured",
                    measurement_kind: row.visibility_provenance.measurement_kind,
                    source_engines: row.visibility_provenance.source_engines,
                    measurement_window_start: row.visibility_provenance.window_start,
                    measurement_window_end: row.visibility_provenance.window_end,
                    visibility_pct: row.visibility_pct,
                    measurement_source: null,
                  }}
                />
              )}
            </td>
            <td>{row.gap_pct === null ? <span className="muted">—</span> : `${row.gap_pct}%`}</td>
            <td>{bucketLabel(row.bucket, t)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChannelQualityTable({ rows }: { rows: ChannelQualityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No channel data yet.</strong>
        <p className="muted">
          Channel Quality compares orders and conversion rate per channel once orders carry a channel
          attribution basis.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Channel</th>
          <th>Sessions</th>
          <th>Orders</th>
          <th>CVR</th>
          <th>Net sales</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.channel}>
            <td>{row.channel}</td>
            <td>
              {row.sessions === null ? (
                <span className="muted">not instrumented in this data</span>
              ) : (
                row.sessions
              )}
            </td>
            <td>{row.orders}</td>
            <td>
              {row.cvr === null ? (
                <span className="muted">— (sessions unknown)</span>
              ) : (
                `${(row.cvr * 100).toFixed(1)}%`
              )}
            </td>
            <td>{usd(row.net_sales)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FunnelTable({ rows }: { rows: FunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No funnel rows yet.</strong>
        <p className="muted">The D → T → O funnel appears once intents carry demand and traffic data.</p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Intent</th>
          <th>D (estimated demand tier)</th>
          <th>T (measured sessions)</th>
          <th>O (attributed orders)</th>
          <th>Coverage</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.intent_id}>
            <td>{row.intent_id}</td>
            <td>
              {row.demand.basis === "not_measured" ? (
                <span className="badge badge-not-measured">not measured</span>
              ) : (
                `${row.demand.tier} (estimated)`
              )}
            </td>
            <td>{row.traffic_sessions}</td>
            <td>{row.attributed_orders}</td>
            <td className="muted">{row.coverage_note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OpportunityTable({ rows }: { rows: OpportunityScoreRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No opportunity scores yet.</strong>
        <p className="muted">
          Opportunity Scores rank intents by expected incremental revenue once demand gaps and attributed
          commission exist.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Intent</th>
          <th>Opportunity Score</th>
          <th>How it is derived</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.intent_id}>
            <td>{row.intent_id}</td>
            <td>
              <EstimatedBadge />{" "}
              {row.score === null ? <span className="muted">withheld — not measurable for this unit</span> : row.score}
            </td>
            <td className="muted">{row.note ?? row.formula}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The whole Attribution module in §2.3 subview order, on one page. */
export function AttributionPanels({ payload }: { payload: AttributionPayload }) {
  return (
    <>
      <section id="intent-yield" className="attribution-subview">
        <div className="card">
          <div className="intent-head">
            <h3>Intent Yield — orders × intents</h3>
            <SourceLabel kind="attribution_model" />
          </div>
          <p className="muted">
            Which intents bring how many orders, over the measured window. Sales figures come from the Shopify
            order ledger (measured); refunds offset gross rather than hiding it.
          </p>
          <IntentYieldTable rows={payload.intent_yield} />
        </div>
      </section>
      <section id="demand-gap" className="attribution-subview">
        <div className="card">
          <div className="intent-head">
            <h3>Demand Gap — traffic × intents</h3>
            <SourceLabel kind="attribution_model" />
          </div>
          <p className="muted">
            Estimated market demand against measured visibility. Buckets: Revenue Expansion (unmet demand ≥50%),
            Market Expansion (30–49%), Healthy below that. Demand is an estimated tier — never an invented
            search volume.
          </p>
          <DemandGapTable rows={payload.demand_gap} />
        </div>
      </section>
      <section id="channel-quality" className="attribution-subview">
        <div className="card">
          <div className="intent-head">
            <h3>Channel Quality — traffic × orders</h3>
            <SourceLabel kind="attribution_model" />
          </div>
          <p className="muted">Where traffic converts to orders, and which channels carry high-intent sessions.</p>
          <ChannelQualityTable rows={payload.channel_quality} />
        </div>
      </section>
      <div className="card">
        <div className="intent-head">
          <h3>D → T → O funnel per intent</h3>
        </div>
        <p className="muted">
          Demand → Traffic → Orders per intent. Numeric coverage needs a numeric demand estimate, which this
          product deliberately does not invent — the withheld state is shown instead.
        </p>
        <FunnelTable rows={payload.funnel} />
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>Opportunity Score ranking</h3>
          <span className="badge badge-estimated">every score on this table is estimated</span>
        </div>
        <p className="muted">
          Expected incremental revenue per intent, used for prioritization. Estimates, not ledger facts.
        </p>
        <OpportunityTable rows={payload.opportunity_scores} />
      </div>
    </>
  );
}
