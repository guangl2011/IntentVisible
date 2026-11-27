"use client";

import { useState } from "react";

import type { AiTrafficTrend, CrawlCoverageByType, TopAiVisitPage } from "../../../../lib/plugin/demo-fixtures";
import {
  AI_CRAWL_COVERAGE_FIXTURE,
  AI_TRAFFIC_TREND_BY_CATEGORY,
  AI_TRAFFIC_TREND_BY_PLATFORM,
  AI_VISITS_BY_TYPE_FIXTURE,
  TOP_AI_VISIT_PAGES_FIXTURE,
  crawlCoverageSummary,
  totalAiVisits,
} from "../../../../lib/plugin/demo-fixtures";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { SimulatedLabel } from "./red-lines";

/**
 * Intent Traffic panels (DeepLumen AI Traffic layout): crawl-coverage
 * donut with per-type progress bars, a visits-by-page-type bar chart, a
 * platform/category trend with a toggle, and the top-pages table. Every
 * block renders the Phase I fixture pool under a SimulatedLabel — crawler
 * visit data is not live yet — and the whole surface carries the
 * guardrail: visit shares only, never a conversion or revenue forecast.
 */

type PageType = CrawlCoverageByType["pageType"];

/** Pure helper: bar-chart geometry for one visits-by-type row. */
function barHeight(visits: number, max: number, chartHeight: number): number {
  if (max <= 0) return 0;
  return Math.max(2, Math.round((visits / max) * chartHeight));
}

/** Pure helper: SVG polyline points for one trend series (y inverted). */
function trendPoints(
  series: number[],
  width: number,
  height: number,
  max: number,
): string {
  const stepX = series.length > 1 ? width / (series.length - 1) : width;
  return series
    .map((value, i) => {
      const y = max <= 0 ? height : height - (value / max) * height;
      return `${(i * stepX).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Pure helper: the larger max across both trend views so the toggle never rescales. */
export function trendMax(platform: AiTrafficTrend[], category: AiTrafficTrend[]): number {
  const values = [...platform, ...category].flatMap((row) => Object.values(row.series));
  return Math.max(1, ...values);
}

/** Block (a) — AI crawl coverage: donut with the collected share + per-type bars. */
export function CrawlCoverageCard({ coverage }: { coverage?: CrawlCoverageByType[] }) {
  const t = useT();
  const rows = coverage ?? AI_CRAWL_COVERAGE_FIXTURE;
  const summary = crawlCoverageSummary(rows);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dash = (summary.pct / 100) * circumference;

  return (
    <div className="iv-card ai-traffic-card" data-testid="ai-crawl-coverage">
      <div className="intent-head">
        <h3>{t.aiTraffic.coverageTitle}</h3>
        <SimulatedLabel what={t.simLabels.crawlCoverage} />
      </div>
      <div className="ai-coverage-hero">
        <span className="iv-coverage-ring" role="img" aria-label={`${summary.pct}%`}>
          <svg viewBox="0 0 100 100" width="120" height="120" aria-hidden="true">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--iv-surface-sunk)" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="var(--iv-brand)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              transform="rotate(-90 50 50)"
            />
            <text x="50" y="56" textAnchor="middle" className="iv-coverage-pct">
              {summary.pct}%
            </text>
          </svg>
        </span>
        <div>
          <p className="iv-coverage-headline">
            {summary.collected}
          </p>
          <p className="muted">{t.aiTraffic.coverageHeadline(summary.collected, summary.total)}</p>
        </div>
      </div>
      <p className="muted">{t.aiTraffic.coverageByTypeTitle}</p>
      <ul className="ai-coverage-rows">
        {rows.map((row) => (
          <li key={row.pageType}>
            <span className="ai-coverage-type">{t.pageTypes[row.pageType]}</span>
            <span className="ai-coverage-bar" aria-hidden="true">
              <span
                className="ai-coverage-bar-fill"
                style={{ width: `${row.total === 0 ? 0 : (row.collected / row.total) * 100}%` }}
              />
            </span>
            <span className="ai-coverage-count">{t.aiTraffic.coverageRow(row.collected, row.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Block (b) — AI Traffic by Page Type: bar chart with counts and share of total. */
export function VisitsByTypeCard() {
  const t = useT();
  const max = Math.max(...AI_VISITS_BY_TYPE_FIXTURE.map((row) => row.visits), 1);
  const total = totalAiVisits(AI_VISITS_BY_TYPE_FIXTURE);

  return (
    <div className="iv-card ai-traffic-card" data-testid="ai-visits-by-type">
      <div className="intent-head">
        <h3>{t.aiTraffic.byTypeTitle}</h3>
        <SimulatedLabel what={t.simLabels.visitsByType} />
      </div>
      <div className="ai-bar-chart">
        {AI_VISITS_BY_TYPE_FIXTURE.map((row) => (
          <div key={row.pageType} className="ai-bar-col">
            <span className="ai-bar-count">{row.visits}</span>
            <span className="ai-bar" aria-hidden="true">
              <span
                className={`ai-bar-fill ai-bar-${row.pageType}`}
                style={{ height: `${barHeight(row.visits, max, 120)}px` }}
              />
            </span>
            <span className="ai-bar-label">{t.pageTypes[row.pageType]}</span>
            <span className="ai-bar-share">{t.aiTraffic.shareLabel(total === 0 ? 0 : Math.round((row.visits / total) * 100))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The platform/category toggle state shared by the trend card. */
type TrendView = "platform" | "category";

const TREND_SERIES: { key: string; color: number }[] = [
  { key: "claude", color: 1 },
  { key: "chatgpt", color: 2 },
  { key: "perplexity", color: 3 },
  { key: "others", color: 4 },
];

const CATEGORY_SERIES: { key: string; color: number }[] = [
  { key: "products", color: 1 },
  { key: "collections", color: 2 },
  { key: "blog", color: 3 },
  { key: "home", color: 4 },
];

/** Block (c) — AI Traffic Trend: multi-series SVG lines with the By Platform / By Category toggle. */
export function TrafficTrendCard() {
  const t = useT();
  const [view, setView] = useState<TrendView>("platform");
  const data = view === "platform" ? AI_TRAFFIC_TREND_BY_PLATFORM : AI_TRAFFIC_TREND_BY_CATEGORY;
  const seriesDefs = view === "platform" ? TREND_SERIES : CATEGORY_SERIES;
  const max = trendMax(AI_TRAFFIC_TREND_BY_PLATFORM, AI_TRAFFIC_TREND_BY_CATEGORY);
  const width = 560;
  const height = 140;
  const days = data.map((row) => row.day);

  return (
    <div className="iv-card ai-traffic-card" data-testid="ai-traffic-trend">
      <div className="intent-head">
        <h3>{t.aiTraffic.trendTitle}</h3>
        <SimulatedLabel what={t.simLabels.visitTrend} />
      </div>
      <div className="ai-trend-toolbar">
        <ul className="ai-trend-legend">
          {seriesDefs.map((series) => (
            <li key={series.key}>
              <span className="iv-swatch" style={{ background: `var(--iv-series-${series.color})` }} aria-hidden="true" />
              {view === "platform"
                ? t.aiTraffic.platforms[series.key as keyof typeof t.aiTraffic.platforms]
                : t.pageTypes[series.key as PageType]}
            </li>
          ))}
        </ul>
        <div className="ai-trend-toggle" role="tablist" aria-label={t.aiTraffic.trendTitle}>
          <button
            type="button"
            role="tab"
            aria-selected={view === "platform"}
            className={view === "platform" ? "is-active" : ""}
            onClick={() => setView("platform")}
            data-testid="trend-by-platform"
          >
            {t.aiTraffic.byPlatform}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "category"}
            className={view === "category" ? "is-active" : ""}
            onClick={() => setView("category")}
            data-testid="trend-by-category"
          >
            {t.aiTraffic.byCategory}
          </button>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="ai-trend-svg"
        role="img"
        aria-label={t.aiTraffic.trendTitle}
        data-testid="ai-traffic-trend-svg"
      >
        {seriesDefs.map((series) => (
          <polyline
            key={series.key}
            points={trendPoints(data.map((row) => row.series[series.key] ?? 0), width, height, max)}
            fill="none"
            stroke={`var(--iv-series-${series.color})`}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="ai-trend-axis" aria-hidden="true">
        <span>{days[0]}</span>
        <span>{days[Math.floor(days.length / 2)]}</span>
        <span>{days[days.length - 1]}</span>
      </div>
    </div>
  );
}

/** Block (d) — Top 10 pages by AI visits table. */
export function TopPagesCard({ pages }: { pages?: TopAiVisitPage[] }) {
  const t = useT();
  const rows = pages ?? TOP_AI_VISIT_PAGES_FIXTURE;

  return (
    <div className="iv-card ai-traffic-card" data-testid="ai-top-pages">
      <div className="intent-head">
        <h3>{t.aiTraffic.topPagesTitle}</h3>
        <SimulatedLabel what={t.simLabels.topPages} />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{t.aiTraffic.topPagesHeaders.page}</th>
            <th>{t.aiTraffic.topPagesHeaders.type}</th>
            <th>{t.aiTraffic.topPagesHeaders.visits}</th>
            <th>{t.aiTraffic.topPagesHeaders.share}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.url}>
              <td className="intent-id">{row.url}</td>
              <td>{t.pageTypes[row.pageType]}</td>
              <td>{row.visits}</td>
              <td>{t.aiTraffic.shareLabel(Math.round(row.shareOfVisits * 100))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
