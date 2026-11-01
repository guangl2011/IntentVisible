import type { MetricsSnapshot } from "@intentvisible/client";

import { EmptyPanel } from "../../components/panels";
import { DataModeHeader } from "./data-mode-header";

/**
 * The metrics dashboard: pooled visibility / gap / void / citations /
 * sentiment per intent (prompt_id absent) and per prompt (prompt_id set),
 * every number carrying its provenance line — runs, platforms, dates, data
 * mode, provider model. The Data Mode header renders once when all
 * snapshots agree; a disagreement surfaces as a mixed-modes warning.
 */

export function sharedDataMode(snapshots: readonly MetricsSnapshot[]): MetricsSnapshot["data_mode"] | null {
  const modes = new Set(snapshots.map((snapshot) => snapshot.data_mode));
  return modes.size === 1 ? (snapshots[0]?.data_mode ?? null) : null;
}

function formatDates(snapshot: MetricsSnapshot): string {
  const from = snapshot.date_range.from.slice(0, 10);
  const to = snapshot.date_range.to.slice(0, 10);
  return from === to ? from : `${from} → ${to}`;
}

function ProvenanceLine({ snapshot }: { snapshot: MetricsSnapshot }) {
  return (
    <span className="muted provenance-line">
      {snapshot.run_count} runs · {snapshot.platforms.join(", ")} · {formatDates(snapshot)} ·{" "}
      {snapshot.provider_model} · data mode: {snapshot.data_mode}
    </span>
  );
}

function MetricRow({ snapshot, scope }: { snapshot: MetricsSnapshot; scope: "intent" | "prompt" }) {
  const topCitations = snapshot.citation_share.slice(0, 3);
  return (
    <tr>
      <td>
        {scope === "intent" ? snapshot.intent_id : snapshot.prompt_id}
        <br />
        <ProvenanceLine snapshot={snapshot} />
      </td>
      <td>{snapshot.visibility_pct.toFixed(1)}%</td>
      <td>
        {snapshot.leader_gap_pct === null || snapshot.top_competitor_id === null ? (
          "—"
        ) : (
          <>
            {snapshot.leader_gap_pct.toFixed(1)}% (behind {snapshot.top_competitor_id})
          </>
        )}
      </td>
      <td>{snapshot.void_rate_pct.toFixed(1)}%</td>
      <td>
        {topCitations.length === 0
          ? "—"
          : topCitations.map((entry) => `${entry.domain} ${entry.share_pct.toFixed(0)}%`).join(", ")}
      </td>
      <td>{snapshot.sentiment_index !== null ? snapshot.sentiment_index.toFixed(0) : "—"}</td>
      <td>
        <span className={snapshot.consensus === "stable" ? "badge badge-APPROVED" : "badge badge-PENDING_APPROVAL"}>
          {snapshot.consensus}
        </span>
      </td>
    </tr>
  );
}

function SnapshotTable({
  snapshots,
  scope,
  caption,
}: {
  snapshots: MetricsSnapshot[];
  scope: "intent" | "prompt";
  caption: string;
}) {
  if (snapshots.length === 0) return null;
  return (
    <table className="metric-table">
      <caption className="muted">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{scope === "intent" ? "Intent" : "Prompt"}</th>
          <th scope="col">Visibility</th>
          <th scope="col">Leader gap</th>
          <th scope="col">Void rate</th>
          <th scope="col">Top citations</th>
          <th scope="col">Sentiment</th>
          <th scope="col">Consensus</th>
        </tr>
      </thead>
      <tbody>
        {snapshots.map((snapshot) => (
          <MetricRow
            key={snapshot.metrics_id}
            snapshot={snapshot}
            scope={scope}
          />
        ))}
      </tbody>
    </table>
  );
}

export function MetricsDashboard({ snapshots }: { snapshots: MetricsSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <EmptyPanel
        title="No metrics yet"
        hint="Metrics appear after the monitoring baseline runs — visibility, gap, void, citations, and sentiment, each with its provenance."
      />
    );
  }
  const perIntent = snapshots.filter((snapshot) => snapshot.prompt_id === null);
  const perPrompt = snapshots.filter((snapshot) => snapshot.prompt_id !== null);
  const mode = sharedDataMode(snapshots);
  return (
    <div className="card metrics-dashboard">
      <div className="intent-head">
        <h2 className="page-title">Metrics</h2>
        {mode === null ? (
          <span className="badge badge-DENIED">mixed data modes</span>
        ) : (
          <DataModeHeader dataMode={mode} />
        )}
      </div>
      <SnapshotTable snapshots={perIntent} scope="intent" caption="Per intent (pooled across prompts)" />
      <SnapshotTable snapshots={perPrompt} scope="prompt" caption="Per prompt (pooled across runs)" />
    </div>
  );
}
