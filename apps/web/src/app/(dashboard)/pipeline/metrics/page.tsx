"use client";

import { useCallback } from "react";

import type { MetricsResponse } from "@intentvisible/client";

import { getPipelineClient } from "../../../../lib/pipeline/client";
import { loadPipeline } from "../../../../lib/pipeline/load";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { MetricsDashboard } from "../components/metrics-dashboard";
import { PipelineNav } from "../components/pipeline-nav";
import { usePipelinePage } from "../use-pipeline-page";

/**
 * The metrics dashboard page: visibility, gap, void, citations, sentiment —
 * each number carrying its provenance (runs, platforms, dates, data mode,
 * provider model) per the blueprint's provenance rules.
 */
export default function PipelineMetricsPage() {
  const loader = useCallback(
    (projectId: string) => loadPipeline(() => getPipelineClient().listMetrics(projectId)),
    [],
  );
  const { hydrated, binding, result } = usePipelinePage<MetricsResponse>(loader);

  if (!hydrated || (binding !== null && result === null)) {
    return (
      <>
        <PipelineNav active="metrics" />
        <LoadingPanel label="metrics" />
      </>
    );
  }
  if (binding === null) {
    return (
      <>
        <PipelineNav active="metrics" />
        <ErrorPanel message="No pipeline project is bound to this browser — finish onboarding first." />
      </>
    );
  }
  if (result === null) return null;
  if (!result.ok) {
    return (
      <>
        <PipelineNav active="metrics" />
        <ErrorPanel message={result.error.message} />
      </>
    );
  }

  return (
    <>
      <PipelineNav active="metrics" />
      <MetricsDashboard snapshots={result.data.snapshots} />
    </>
  );
}
