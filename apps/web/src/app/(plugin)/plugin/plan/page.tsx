"use client";

import Link from "next/link";
import { useCallback } from "react";

import { EXAMPLE_ATTRIBUTED_ORDERS_SERIES } from "../../../../lib/plugin/demo-fixtures";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import type { CommissionLedgerPayload } from "../../../../lib/plugin/types";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { LoadingPanel } from "../../../(dashboard)/components/panels";
import { BlindSpotFooter, SimulatedLabel, SourceLabel } from "../components/red-lines";
import { usePluginPage } from "../use-plugin-page";

/**
 * Plan (DeepLumen Plan layout, our naming and our numbers): the
 * performance-billing commercial model — $0 monthly fee, per-order
 * commission in the locked 5–20% band, refunds auto-credited. The
 * checklist states only what the billing engine actually configures:
 * the engine has no first-N-orders-free waiver, so none is claimed.
 * The growth band's chart is an illustration, marked EXAMPLE.
 */

/** Pure helper: the latest billed period across ledger entries, or null. */
export function currentBillingCycle(payload: CommissionLedgerPayload): { start: string; end: string } | null {
  const latest = payload.entries[payload.entries.length - 1];
  if (latest === undefined) return null;
  return { start: latest.billed_period_start, end: latest.billed_period_end };
}

/** Pure helper: layered SVG polylines for the EXAMPLE attributed-orders chart. */
export function exampleChartPoints(
  series: number[][],
  width = 320,
  height = 120,
): string[] {
  const max = Math.max(1, ...series.flat());
  return series.map((line) => {
    const stepX = line.length > 1 ? width / (line.length - 1) : width;
    return line
      .map((value, i) => `${(i * stepX).toFixed(1)},${(height - (value / max) * (height - 6)).toFixed(1)}`)
      .join(" ");
  });
}

/** The commercial-model card: headline, $0 fee, cycle row, checklist, actions. */
export function PlanSummaryCard({ cycle }: { cycle: { start: string; end: string } | null }) {
  const t = useT();
  return (
    <div className="iv-card plan-summary-card" data-testid="plan-summary">
      <div className="plan-summary-main">
        <h3>{t.plan.headline}</h3>
        <p className="plan-pay-when">{t.plan.payWhen}</p>
        <p className="plan-fee">
          <span className="plan-fee-amount">$0</span>{" "}
          <span className="muted">{t.plan.monthlyFeeLabel}</span>
        </p>
        <p className="muted">
          {t.plan.billingCycleTitle}: {cycle ? t.plan.billingCycle(cycle.start, cycle.end) : "—"}{" "}
          {cycle ? <SourceLabel kind="measured" /> : null}
        </p>
        <button type="button" className="btn plan-manage-button" disabled>
          {t.plan.manageButton}
        </button>
        <p>
          <Link href="/plugin/commission">{t.plan.rulesLink}</Link>
        </p>
      </div>
      <ul className="plan-checklist" data-testid="plan-checklist">
        {[t.plan.checklist.noMonthlyFee, t.plan.checklist.rateBand, t.plan.checklist.refundsCredited].map((item) => (
          <li key={item}>
            <span className="plan-check-mark" aria-hidden="true">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The expandable per-category rates section. */
export function PlanRatesSection() {
  const t = useT();
  return (
    <details className="iv-card plan-rates" data-testid="plan-rates">
      <summary>
        {t.plan.ratesTitle} <span className="muted">{t.plan.ratesExpand}</span>
      </summary>
      <ul>
        <li>{t.plan.rateBandRow}</li>
        <li>{t.plan.rateBaseRow}</li>
        <li className="muted">{t.plan.ratesNote}</li>
      </ul>
    </details>
  );
}

/** The growth explainer band: steps + EXAMPLE chart. */
export function PlanGrowthBand() {
  const t = useT();
  const polylines = exampleChartPoints(EXAMPLE_ATTRIBUTED_ORDERS_SERIES);

  return (
    <section className="overview-block" data-block="plan-growth" data-testid="plan-growth">
      <p className="plan-growth-band-title">{t.plan.growthBandTitle}</p>
      <div className="plan-growth-grid">
        <div>
          <p className="plan-growth-kicker">{t.plan.growthKicker}</p>
          <p className="plan-growth-headline">{t.plan.growthHeadline}</p>
          <ul className="plan-growth-steps">
            {t.plan.growthSteps.map((step) => (
              <li key={step}>
                <span className="plan-check-mark" aria-hidden="true">
                  ✓
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>
        <div className="iv-card plan-example-chart">
          <div className="intent-head">
            <h4>{t.plan.exampleChartTitle}</h4>
            <span className="badge badge-example">{t.plan.exampleBadge}</span>
          </div>
          <SimulatedLabel what={t.simLabels.exampleChart} />
          <svg viewBox="0 0 320 120" className="plan-example-svg" role="img" aria-label={t.plan.exampleChartTitle}>
            {polylines.map((points, i) => (
              <polyline
                key={points}
                points={points}
                fill="none"
                stroke={`var(--iv-series-${i + 1})`}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}

function loadCommission(shopId: string) {
  return loadPlugin(() => getPluginClient().commission(shopId));
}

export default function PlanPage() {
  const t = useT();
  const loader = useCallback((shopId: string) => loadCommission(shopId), []);
  const { result } = usePluginPage(loader);

  const payload: CommissionLedgerPayload | null = result?.ok ? result.data.payload : null;
  const cycle = payload ? currentBillingCycle(payload) : null;

  return (
    <>
      <h1>{t.plan.title}</h1>
      <p className="muted">{t.plan.intro}</p>

      {result !== null && !result.ok ? (
        <LoadingPanel label={t.plan.title} />
      ) : result === null ? (
        <LoadingPanel label={t.plan.title} />
      ) : (
        <PlanSummaryCard cycle={cycle} />
      )}

      <PlanRatesSection />
      <PlanGrowthBand />

      <BlindSpotFooter items={t.blindSpots.plan} />
    </>
  );
}
