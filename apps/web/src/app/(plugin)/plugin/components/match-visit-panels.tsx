"use client";

import Link from "next/link";

import type { MatchPayload } from "../../../../lib/plugin/types";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { usd } from "./badges";
import { SourceLabel } from "./red-lines";

/**
 * Intent Match visit + settlement panels (design v1.4 §2.5), exported
 * for unit tests: the affiliate-visit table (channel / partner /
 * tracking-code provenance, order linkage) and the settlement gate that
 * computes only over provider_measured data. All copy renders through
 * the dictionary (design v1.5 §0.6 rule 2).
 */

export function AffiliateVisitsPanel({ payload }: { payload: MatchPayload }) {
  const t = useT();
  return (
    <div className="card">
      <div className="intent-head">
        <h3>{t.affiliateVisit.visits.title}</h3>
        <SourceLabel kind="measured" />
      </div>
      {payload.affiliate_visits.length === 0 ? (
        <p className="muted">{t.affiliateVisit.visits.empty}</p>
      ) : (
        <table className="table" data-testid="affiliate-visit-table">
          <thead>
            <tr>
              <th>{t.affiliateVisit.visits.headers.visit}</th>
              <th>{t.affiliateVisit.visits.headers.channel}</th>
              <th>{t.affiliateVisit.visits.headers.partner}</th>
              <th>{t.affiliateVisit.visits.headers.tracking}</th>
              <th>{t.affiliateVisit.visits.headers.landed}</th>
              <th>{t.affiliateVisit.visits.headers.order}</th>
              <th>{t.affiliateVisit.visits.headers.landedAt}</th>
            </tr>
          </thead>
          <tbody>
            {payload.affiliate_visits.map((visit) => (
              <tr key={visit.visit_id}>
                <td className="intent-id">{visit.visit_id}</td>
                <td>{visit.channel}</td>
                <td>{visit.partner}</td>
                <td className="mono">{visit.tracking_code}</td>
                <td>{visit.landed_intent_id ?? <span className="muted">{t.affiliateVisit.visits.noIntentPage}</span>}</td>
                <td>
                  {visit.order_number ?? (
                    <Link href="/plugin/attribution#channel-quality">{t.affiliateVisit.visits.noOrderYet}</Link>
                  )}
                </td>
                <td>{visit.landed_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">
        {t.affiliateVisit.visits.joinNote}{" "}
        <Link href="/plugin/commission">{t.affiliateVisit.visits.joinLink}</Link>.
      </p>
    </div>
  );
}

/** The settlement gate: computed only over provider_measured data. */
export function SettlementPanel({ settlement }: { settlement: MatchPayload["settlement"] }) {
  const t = useT();
  if (settlement.status === "withheld") {
    return (
      <div className="card failure-card">
        <div className="intent-head">
          <h3>{t.affiliateVisit.settlement.withheldTitle}</h3>
        </div>
        <p>{t.affiliateVisit.settlement.withheldBody(settlement.reason)}</p>
        <p className="muted">{t.affiliateVisit.settlement.withheldNote}</p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="intent-head">
        <h3>{t.affiliateVisit.settlement.title}</h3>
        <SourceLabel kind="measured" />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{t.affiliateVisit.settlement.headers.code}</th>
            <th>{t.affiliateVisit.settlement.headers.gross}</th>
            <th>{t.affiliateVisit.settlement.headers.refunds}</th>
            <th>{t.affiliateVisit.settlement.headers.net}</th>
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
