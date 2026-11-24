"use client";

import type { AlertSeverity, VisibilityProvenance } from "../../../../lib/plugin/types";
import { useT } from "../../../../lib/plugin/i18n/locale";
import type { Dictionary } from "../../../../lib/plugin/i18n/dictionary";

/**
 * The provenance vocabulary every plugin page renders next to its numbers
 * (design v1.5 §2.7): measured-vs-simulated separation, estimated and
 * heuristic labels, and the not_measured state rendered as its own state —
 * never a fabricated value, never a single-day snapshot presented as
 * steady state. All text comes from the active locale's dictionary.
 */

/** Severity chip for alerts and audit recommendations. */
export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <span className={`badge badge-${severity.toUpperCase()}`}>{severity.toUpperCase()}</span>;
}

/** Marks a derivation as estimated — required on every Opportunity Score. */
export function EstimatedBadge() {
  const t = useT();
  return <span className="badge badge-estimated">{t.common.estimated}</span>;
}

/** Marks a score as heuristic — required on Readiness and Intent Health Score. */
export function HeuristicBadge() {
  const t = useT();
  return <span className="badge badge-heuristic">{t.common.heuristicBadge}</span>;
}

/** Human label for a demand-gap bucket (localized; pure in the bucket value). */
export function bucketLabel(bucket: string, t: Dictionary): string {
  switch (bucket) {
    case "revenue_expansion":
      return t.attribution.buckets.revenue_expansion;
    case "market_expansion":
      return t.attribution.buckets.market_expansion;
    case "healthy":
      return t.attribution.buckets.healthy;
    case "not_measured":
      return t.attribution.buckets.not_measured;
    default:
      return bucket;
  }
}

/**
 * Full visibility provenance cell: engines + window for measured values,
 * a single-day warning where the measurement is a snapshot, and an
 * explicit not-measured state — never a percentage in place of a
 * measurement that does not exist.
 */
export function VisibilityProvenanceBadge({ visibility }: { visibility: VisibilityProvenance }) {
  const t = useT();
  if (visibility.measurement_status === "not_measured" || visibility.visibility_pct === null) {
    return (
      <span className="badge badge-not-measured" title={t.common.enginesNotRecorded}>
        {t.common.notMeasured}
      </span>
    );
  }
  const engines = (visibility.source_engines ?? []).join(", ") || t.common.enginesNotRecorded;
  const singleDay = visibility.measurement_kind === "single_day";
  return (
    <span
      className={`badge ${singleDay ? "badge-single-day" : "badge-measured"}`}
      title={singleDay ? t.common.singleDaySnapshot : t.common.rolling}
    >
      {visibility.visibility_pct}% · {engines} · {visibility.measurement_window_start} →{" "}
      {visibility.measurement_window_end}
      {singleDay ? ` · ${t.common.singleDaySnapshot}` : ` · ${t.common.rolling}`}
    </span>
  );
}

/** Formats a USD amount for the billing surfaces. */
export function usd(amount: number): string {
  const formatted = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `−$${formatted}` : `$${formatted}`;
}
