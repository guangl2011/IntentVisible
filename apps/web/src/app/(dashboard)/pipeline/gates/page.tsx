"use client";

import { useCallback, useState } from "react";

import type {
  GateDecision,
  GraphResponse,
  LibPreviewResponse,
  MetricsResponse,
  ProjectBundle,
  PromptsResponse,
} from "@intentvisible/client";

import { getPipelineClient } from "../../../../lib/pipeline/client";
import { loadPipeline, type LoadResult } from "../../../../lib/pipeline/load";
import { decideReview } from "../../../../lib/pipeline/gates";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { GateReviewPanel } from "../components/gate-review-panel";
import { GraphPanel } from "../components/graph-panel";
import { LibPreviewPanel } from "../components/lib-preview-panel";
import { MetricsDashboard } from "../components/metrics-dashboard";
import { PipelineNav } from "../components/pipeline-nav";
import { PromptsPanel } from "../components/prompts-panel";
import { usePipelinePage } from "../use-pipeline-page";

/** Everything the three gate screens render, fetched in one round. */
interface GateData {
  bundle: ProjectBundle;
  graph: GraphResponse;
  prompts: PromptsResponse;
  metrics: MetricsResponse;
  lib: LibPreviewResponse;
}

function loadGateData(projectId: string): Promise<LoadResult<GateData>> {
  const client = getPipelineClient();
  return loadPipeline(async () => {
    const [bundle, graph, prompts, metrics, lib] = await Promise.all([
      client.getProject(projectId),
      client.getGraph(projectId),
      client.listPrompts(projectId),
      client.listMetrics(projectId),
      client.getLibPreview(projectId),
    ]);
    return { bundle, graph, prompts, metrics, lib };
  });
}

/**
 * The three gate confirmation screens (blueprint gates table): Gate 1 the
 * Marketing Graph, Gate 2 the prompts grouped by intent, Gate 3 the metrics
 * dashboard plus the pre-publish lib with its Data Mode header. Approve
 * proceeds; reject requires a note — the feedback the pipeline re-runs
 * with. Inline edit/kill/swap and publish exclusion/annotation are not in
 * the API's review contract; the note carries that feedback instead.
 */
export default function PipelineGatesPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loader = useCallback(
    (projectId: string) => loadGateData(projectId),
    [],
  );
  const { hydrated, binding, result, reload } = usePipelinePage(loader);

  const decide = async (
    reviewId: string,
    decision: GateDecision,
    note: string | undefined,
  ) => {
    setBusy(true);
    setError(null);
    const decided = await decideReview(reviewId, decision, note);
    setBusy(false);
    if (!decided.ok) {
      setError(decided.error.message);
      return;
    }
    reload();
  };

  if (!hydrated) {
    return (
      <>
        <PipelineNav active="gates" />
        <LoadingPanel label="gate reviews" />
      </>
    );
  }

  if (binding === null) {
    return (
      <>
        <PipelineNav active="gates" />
        <ErrorPanel message="No pipeline project is bound to this browser — finish onboarding first." />
      </>
    );
  }

  if (result === null) {
    return (
      <>
        <PipelineNav active="gates" />
        <LoadingPanel label="gate reviews" />
      </>
    );
  }
  if (!result.ok) {
    return (
      <>
        <PipelineNav active="gates" />
        <ErrorPanel message={result.error.message} />
      </>
    );
  }

  const { bundle, graph, prompts, metrics, lib } = result.data;
  const enabledGates = Object.entries(bundle.project.gate_config)
    .filter(([, enabled]) => enabled)
    .map(([gate]) => Number(gate));

  const artifactFor = (gate: number) => {
    if (gate === 1) return <GraphPanel graph={graph.graph} />;
    if (gate === 2) return <PromptsPanel prompts={prompts.prompts} />;
    return (
      <>
        <MetricsDashboard snapshots={metrics.snapshots} />
        <LibPreviewPanel lib={lib.lib} />
      </>
    );
  };

  return (
    <>
      <PipelineNav active="gates" />
      {enabledGates.length === 0 && (
        <ErrorPanel message="No gates are enabled for this project — the pipeline runs unattended." />
      )}
      {enabledGates.map((gate) => {
        const review = bundle.gates.find((candidate) => candidate.gate === gate) ?? null;
        const pending = review !== null && review.status === "pending" ? review : null;
        return (
          <GateReviewPanel
            key={gate}
            gate={gate}
            review={review}
            timeoutAt={pending?.timeout_at}
            onDecide={(decision, note) => {
              if (review !== null) void decide(review.review_id, decision, note);
            }}
            busy={busy}
            error={error}
          >
            {artifactFor(gate)}
          </GateReviewPanel>
        );
      })}
    </>
  );
}
