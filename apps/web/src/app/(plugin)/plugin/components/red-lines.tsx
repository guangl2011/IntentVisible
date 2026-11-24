"use client";

import type { ReactNode } from "react";

import { useT } from "../../../../lib/plugin/i18n/locale";

/**
 * §2.7 red-line primitives shared by every plugin page: the tri-color
 * source label on key numbers, the data-blind-spot footer every page
 * carries, and the empty state that always answers "why can't I see
 * this data" instead of leaving a blank area. All text renders in the
 * active locale from the dictionary — never mixed (design v1.5 §0.6).
 */

export type SourceKind = "measured" | "attribution_model" | "platform_reported";

/** Tri-color provenance chip for a key number's source (§2.7). */
export function SourceLabel({ kind }: { kind: SourceKind }) {
  const t = useT();
  const labels: Record<SourceKind, string> = {
    measured: t.sourceLabel.measured,
    attribution_model: t.sourceLabel.attributionModel,
    platform_reported: t.sourceLabel.platformReported,
  };
  return (
    <span className={`source-label source-${kind}`} title={labels[kind]}>
      {labels[kind]}
    </span>
  );
}

/** Simulated chip for blocks served from local demo fixtures, not the API. */
export function SimulatedLabel({ what }: { what: string }) {
  const t = useT();
  return (
    <span className="source-label source-simulated" title={t.common.simulatedTitle(what)}>
      {t.common.simulatedChip(what)}
    </span>
  );
}

/** The data-blind-spot footer every plugin page renders (§2.3/§2.7). */
export function BlindSpotFooter({ items }: { items: string[] }) {
  const t = useT();
  return (
    <footer className="blind-spot-footer" data-testid="blind-spot-footer">
      <strong>{t.common.blindSpotsTitle}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </footer>
  );
}

/**
 * The §2.7 empty state: never a blank area — an explanation, the call to
 * action, and a "why can't I see this data" disclosure that answers the
 * question in place.
 */
export function EmptyWithWhy({
  title,
  hint,
  why,
  children,
}: {
  title: string;
  hint: string;
  why: string;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="card empty-card" data-testid="empty-with-why">
      <strong>{title}</strong>
      <p className="muted">{hint}</p>
      <details className="why-details">
        <summary>{t.common.whyTitle}</summary>
        <p className="muted">{why}</p>
      </details>
      {children}
    </div>
  );
}
