"use client";

import { useCallback } from "react";

import type { PublishedResponse } from "@intentvisible/client";

import { getPipelineClient } from "../../../../lib/pipeline/client";
import { loadPipeline } from "../../../../lib/pipeline/load";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { LibBrowser } from "../components/lib-browser";
import { PipelineNav } from "../components/pipeline-nav";
import { usePipelinePage } from "../use-pipeline-page";

/** The lib browser page over the project's published Buyer Intent Lib records. */
export default function PipelineLibraryPage() {
  const loader = useCallback(
    (projectId: string) => loadPipeline(() => getPipelineClient().listPublished(projectId)),
    [],
  );
  const { hydrated, binding, result } = usePipelinePage<PublishedResponse>(loader);

  if (!hydrated || (binding !== null && result === null)) {
    return (
      <>
        <PipelineNav active="library" />
        <LoadingPanel label="published intents" />
      </>
    );
  }
  if (binding === null) {
    return (
      <>
        <PipelineNav active="library" />
        <ErrorPanel message="No pipeline project is bound to this browser — finish onboarding first." />
      </>
    );
  }
  if (result === null) return null;
  if (!result.ok) {
    return (
      <>
        <PipelineNav active="library" />
        <ErrorPanel message={result.error.message} />
      </>
    );
  }

  return (
    <>
      <PipelineNav active="library" />
      <LibBrowser records={result.data.records} />
    </>
  );
}
