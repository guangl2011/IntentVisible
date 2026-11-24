/**
 * Shared presentation primitives for the rebuilt plugin UI (design v1.5
 * §0.6): full-width cards on a consistent spacing scale, a restrained
 * palette driven by CSS custom properties, and lightweight inline-SVG
 * fixtures for the overview visuals. All chart data is labeled simulated
 * at the callsite (§2.7 provenance rules).
 */

import type { ReactNode } from "react";

export function PluginCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`iv-card ${className ?? ""}`}>{children}</div>;
}

export function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="iv-section-heading">
      <span className="iv-section-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
    </div>
  );
}

export function PageHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <header className="iv-page-header">
      <h1>{title}</h1>
      <p>{intro}</p>
    </header>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="iv-stat-tile">
      <div className="iv-stat-label">{label}</div>
      <div className="iv-stat-value">{value}</div>
      {hint ? <div className="iv-stat-hint">{hint}</div> : null}
    </div>
  );
}

export function PluginLogo() {
  return (
    <span className="iv-logo" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="var(--iv-brand)" strokeWidth="2" />
        <path d="M7 13.5c1.7 1.4 3.4 2.1 5 2.1s3.3-.7 5-2.1" stroke="var(--iv-brand)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="9" cy="9.5" r="1.2" fill="var(--iv-brand)" />
        <circle cx="15" cy="9.5" r="1.2" fill="var(--iv-brand)" />
      </svg>
    </span>
  );
}

/** Lightweight sparkline fixture (brief 2d/3): inline SVG trend line. */
export function MiniTrendLine({
  points,
  width = 220,
  height = 44,
  title,
}: {
  points: number[];
  width?: number;
  height?: number;
  title?: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, height - 4 - ((p - min) / span) * (height - 8)] as const);
  const last = coords[coords.length - 1] ?? ([width, height] as const);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M0,${height} L${line.replaceAll(" ", " L")} L${width},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="iv-minitrend">
      {title ? <title>{title}</title> : null}
      <path d={area} fill="var(--iv-brand-soft)" stroke="none" />
      <polyline points={line} fill="none" stroke="var(--iv-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--iv-brand)" />
    </svg>
  );
}

/** Donut fixture with legend (AI platform distribution, DeepLumen pattern). */
export function DonutChart({
  slices,
  size = 132,
  title,
}: {
  slices: { label: string; value: number }[];
  size?: number;
  title?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="iv-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title} className="iv-donut-svg">
        {title ? <title>{title}</title> : null}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--iv-surface-sunk)" strokeWidth="14" />
        {slices.map((slice, i) => {
          const fraction = slice.value / total;
          const dash = fraction * circumference;
          const circle = (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={`var(--iv-series-${(i % 5) + 1})`}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <ul className="iv-donut-legend">
        {slices.map((slice, i) => (
          <li key={slice.label}>
            <span className="iv-swatch" style={{ background: `var(--iv-series-${(i % 5) + 1})` }} aria-hidden="true" />
            {slice.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * AI platform icon cloud (brief 2b). Neutral wordmarks, not fake brand
 * logos — the platform names are the content.
 */
export function PlatformCloud({ platforms }: { platforms: string[] }) {
  return (
    <div className="iv-platform-cloud">
      {platforms.map((platform, i) => (
        <span key={platform} className={`iv-platform-pill iv-platform-${(i % 5) + 1}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6z" strokeLinejoin="round" />
          </svg>
          {platform}
        </span>
      ))}
    </div>
  );
}
