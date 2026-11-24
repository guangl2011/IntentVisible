"use client";

import { useT } from "../../../../lib/plugin/i18n/locale";

/**
 * Status + provenance primitives for the plugin UI. Every label comes from
 * the dictionary in the active locale (design v1.5 §0.6 rule 2) — no
 * hardcoded strings here, so the components re-render per locale.
 */

export function PluginLoading({ what }: { what: string }) {
  const t = useT();
  return <div className="iv-loading" role="status">{t.common.loading(what)}</div>;
}

export function PluginError({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="iv-error" role="alert">
      <strong>{t.common.errorTitle}</strong>
      <p>{message}</p>
    </div>
  );
}

/**
 * Data-mode chip (design §2.7): `provider_measured` vs `llm_simulated`.
 * The tooltip carries the honest explanation of what the numbers mean.
 */
export function DataModeChip({ dataMode }: { dataMode: "llm_simulated" | "provider_measured" }) {
  const t = useT();
  const label = dataMode === "provider_measured" ? t.common.dataModeMeasured : t.common.dataModeSimulated;
  return (
    <span className={`iv-chip iv-chip-dm iv-chip-dm-${dataMode}`} title={label}>
      {t.common.dataModeTitle}: {dataMode === "provider_measured" ? t.common.dataModeMeasured.split(" ")[0] : t.common.dataModeSimulated.split(" ")[0]}
    </span>
  );
}

export function HeuristicBadge() {
  const t = useT();
  return (
    <span className="iv-chip iv-chip-heuristic" title={t.common.heuristicBadge}>
      {t.common.heuristicShort}
    </span>
  );
}

export function EstimatedBadge({ note }: { note?: string }) {
  const t = useT();
  return (
    <span className="iv-chip iv-chip-estimated" title={note}>
      {t.common.estimated}
    </span>
  );
}

/** Tri-state score ring (design §2.7 / DeepLumen pattern): green/amber/red by score. */
export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const color = clamped >= 80 ? "var(--iv-green)" : clamped >= 50 ? "var(--iv-amber)" : "var(--iv-red)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${clamped}/100`} className="iv-score-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--iv-surface-sunk)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" className="iv-score-ring-text" fontSize={size / 3.4}>
        {clamped}
      </text>
    </svg>
  );
}

export type VisibilityProvenance =
  | { status: "measured"; kind: "rolling" | "single_day" }
  | { status: "not_measured"; kind?: undefined };

/**
 * Visibility provenance badge (measured with rolling/single-day windows,
 * or an explicit not-measured state). Numbers are never invented for the
 * unmeasured case — the badge says so.
 */
export function VisibilityProvenanceBadge({ provenance }: { provenance: VisibilityProvenance }) {
  const t = useT();
  if (provenance.status === "not_measured") {
    return (
      <span className="iv-chip iv-chip-notmeasured" title={t.common.enginesNotRecorded}>
        {t.common.notMeasured}
      </span>
    );
  }
  const label = provenance.kind === "rolling" ? t.common.rolling : t.common.singleDaySnapshot;
  return (
    <span className="iv-chip iv-chip-measured">
      {label}
    </span>
  );
}
