"use client";

import { useCallback } from "react";

import type { GraphResponse, ProjectBundle } from "@intentvisible/client";

import { getPipelineClient } from "../../../../lib/pipeline/client";
import { loadPipeline, type LoadResult } from "../../../../lib/pipeline/load";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { GraphPanel } from "../components/graph-panel";
import { PipelineNav } from "../components/pipeline-nav";
import { usePipelinePage } from "../use-pipeline-page";

/**
 * The Marketing Map as a first-class screen — the dashboard's expression of
 * the core product logic: site research builds the map (Stage A), the map
 * derives buyer intents (Stage B), and every intent is the matching key
 * that routes demand to the right product pages (Intent Match). The map was
 * previously visible only inside Gate 1 review; it is now the hub the
 * research and matching surfaces hang from.
 */

interface MapData {
  bundle: ProjectBundle;
  graph: GraphResponse;
}

function loadMapData(projectId: string): Promise<LoadResult<MapData>> {
  const client = getPipelineClient();
  return loadPipeline(async () => {
    const [bundle, graph] = await Promise.all([
      client.getProject(projectId),
      client.getGraph(projectId),
    ]);
    return { bundle, graph };
  });
}

export default function PipelineMapPage() {
  const loader = useCallback(
    (projectId: string) => loadMapData(projectId),
    [],
  );
  const { hydrated, binding, result } = usePipelinePage(loader);

  if (!hydrated) {
    return (
      <>
        <PipelineNav active="map" />
        <LoadingPanel label="the marketing map" />
      </>
    );
  }

  if (binding === null) {
    return (
      <>
        <PipelineNav active="map" />
        <ErrorPanel message="No pipeline project is bound to this browser — finish onboarding first." />
      </>
    );
  }

  if (result === null) {
    return (
      <>
        <PipelineNav active="map" />
        <LoadingPanel label="the marketing map" />
      </>
    );
  }
  if (!result.ok) {
    return (
      <>
        <PipelineNav active="map" />
        <ErrorPanel message={result.error.message} />
      </>
    );
  }

  const { graph } = result.data;

  return (
    <>
      <PipelineNav active="map" />
      <p className="muted">
        Core logic: research the site → build the marketing map → match buyer
        intents to product pages. Personas, scenarios, and competitors below
        are derived from your own site content; every claim carries evidence or
        an explicit assumption badge.
      </p>
      <GraphPanel graph={graph.graph} />
      <div className="card">
        <div className="intent-head">
          <h3>From map to matching</h3>
        </div>
        <p className="muted">
          Intents derived from this map are the matching keys. Eligible SKUs,
          landing URLs, and evidence-backed selling points live in Intent
          Match — demand from Play and Ads channels lands on the right product
          page.
        </p>
        <a href="/shopify/catalog" className="evidence-link">
          Match intents to product pages →
        </a>
      </div>
    </>
  );
}
