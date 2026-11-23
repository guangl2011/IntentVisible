import type { AlertSeverity, VisibilityProvenance } from "../../../../lib/plugin/types";

/**
 * The provenance vocabulary every plugin page renders next to its numbers
 * (design v1.4 §2.7): measured-vs-simulated separation, estimated and
 * heuristic labels, and the not_measured state rendered as its own state —
 * never a fabricated value, never a single-day snapshot presented as
 * steady state.
 */

/** Severity chip for alerts and audit recommendations. */
export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <span className={`badge badge-${severity.toUpperCase()}`}>{severity.toUpperCase()}</span>;
}

/** Marks a derivation as estimated — required on every Opportunity Score. */
export function EstimatedBadge() {
  return <span className="badge badge-estimated">estimated</span>;
}

/** Marks a score as heuristic — required on Readiness and Intent Health Score. */
export function HeuristicBadge() {
  return <span className="badge badge-heuristic">heuristic — not a conversion or revenue forecast</span>;
}

/** Human label for a demand-gap bucket. */
export function bucketLabel(bucket: string): string {
  switch (bucket) {
    case "revenue_expansion":
      return "Revenue Expansion (gap ≥ 50%)";
    case "market_expansion":
      return "Market Expansion (gap 30–49%)";
    case "healthy":
      return "Healthy";
    case "not_measured":
      return "Not measured";
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
  if (visibility.measurement_status === "not_measured" || visibility.visibility_pct === null) {
    return (
      <span className="badge badge-not-measured" title="No visibility measurement exists for this unit — nothing is invented to fill the gap.">
        not measured
      </span>
    );
  }
  const engines = (visibility.source_engines ?? []).join(", ") || "engines not recorded";
  const singleDay = visibility.measurement_kind === "single_day";
  return (
    <span
      className={`badge ${singleDay ? "badge-single-day" : "badge-measured"}`}
      title={
        singleDay
          ? "Single-day snapshot: do not treat this as steady state."
          : "Rolling-window measurement across the recorded engine set."
      }
    >
      {visibility.visibility_pct}% · {engines} · {visibility.measurement_window_start} →{" "}
      {visibility.measurement_window_end}
      {singleDay ? " · single-day snapshot" : " · rolling"}
    </span>
  );
}

/** Formats a USD amount for the billing surfaces. */
export function usd(amount: number): string {
  const formatted = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `−$${formatted}` : `$${formatted}`;
}
