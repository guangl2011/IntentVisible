import type { ReactNode } from "react";

/**
 * §2.7 red-line primitives shared by every plugin page: the tri-color
 * source label on key numbers, the data-blind-spot footer every page
 * carries, and the empty state that always answers "why can't I see
 * this data" instead of leaving a blank area.
 */

export type SourceKind = "measured" | "attribution_model" | "platform_reported";

const SOURCE_LABELS: Readonly<Record<SourceKind, { zh: string; en: string }>> = {
  measured: { zh: "实测", en: "measured" },
  attribution_model: { zh: "归因模型", en: "attribution model" },
  platform_reported: { zh: "平台自报", en: "platform-reported" },
};

/** Tri-color provenance chip for a key number's source (§2.7). */
export function SourceLabel({ kind }: { kind: SourceKind }) {
  const label = SOURCE_LABELS[kind];
  return (
    <span className={`source-label source-${kind}`} title={label.en}>
      {label.zh} · {label.en}
    </span>
  );
}

/** Simulated chip for blocks served from local demo fixtures, not the API. */
export function SimulatedLabel({ what }: { what: string }) {
  return (
    <span className="source-label source-simulated" title={`${what} — demo fixture, not a measurement`}>
      simulated · {what}
    </span>
  );
}

/** The data-blind-spot footer every plugin page renders (§2.3/§2.7). */
export function BlindSpotFooter({ items }: { items: string[] }) {
  return (
    <footer className="blind-spot-footer" data-testid="blind-spot-footer">
      <strong>数据盲区 · Data blind spots:</strong>
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
  return (
    <div className="card empty-card" data-testid="empty-with-why">
      <strong>{title}</strong>
      <p className="muted">{hint}</p>
      <details className="why-details">
        <summary>为什么看不到这个数据？ · Why can't I see this data?</summary>
        <p className="muted">{why}</p>
      </details>
      {children}
    </div>
  );
}
