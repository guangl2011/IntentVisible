"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  PipelineProject,
  PipelineRun,
  PipelineTrigger,
} from "@intentvisible/client";

import {
  clearBinding,
  loadBinding,
  saveBinding,
  type PipelineBinding,
} from "../../../../lib/pipeline/binding";
import { getPipelineClient } from "../../../../lib/pipeline/client";
import { loadPipeline, type LoadResult } from "../../../../lib/pipeline/load";
import { saveMarket, startPipeline } from "../../../../lib/pipeline/onboarding";
import { CrawlProgress } from "../components/crawl-progress";
import { InstallPanel } from "../components/install-panel";
import { MarketPanel } from "../components/market-panel";
import { PipelineNav } from "../components/pipeline-nav";
import { ErrorPanel, LoadingPanel } from "../../components/panels";

interface Bundle {
  project: PipelineProject;
  pipeline: PipelineRun | null;
}

/**
 * Two-step onboarding (blueprint): step 1 installs — the trigger that starts
 * the crawler on the customer's own site; step 2 picks the market — USA /
 * English by default, editable later with the re-baseline consequence
 * surfaced. Everything after step 2 runs unattended to the first lib.
 */
export default function PipelineOnboardingPage() {
  const [binding, setBinding] = useState<PipelineBinding | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [bundle, setBundle] = useState<LoadResult<Bundle> | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketSaved, setMarketSaved] = useState(false);

  useEffect(() => {
    setBinding(loadBinding());
    setHydrated(true);
  }, []);

  const refresh = useCallback(async (bound: PipelineBinding) => {
    const result = await loadPipeline(() => getPipelineClient().getProject(bound.projectId));
    if (result.ok) {
      setBundle({ ok: true, data: { project: result.data.project, pipeline: result.data.pipeline } });
    } else {
      setBundle(result);
    }
  }, []);

  useEffect(() => {
    if (binding !== null) void refresh(binding);
  }, [binding, refresh]);

  const start = async (siteUrl: string, trigger: PipelineTrigger) => {
    setStartBusy(true);
    setStartError(null);
    try {
      const result = await startPipeline(siteUrl, trigger);
      if (!result.ok) {
        setStartError(result.error.message);
        return;
      }
      const bound: PipelineBinding = {
        projectId: result.data.project.project_id,
        brandName: result.data.project.brand_name,
        siteUrl: result.data.project.site_url,
      };
      saveBinding(bound);
      setBinding(bound);
      setBundle({ ok: true, data: { project: result.data.project, pipeline: result.data.pipeline } });
    } finally {
      setStartBusy(false);
    }
  };

  const saveMarketFor = async (market: { country: string; language: string }) => {
    const projectId = bundle?.ok === true ? bundle.data.project.project_id : binding?.projectId;
    if (projectId === undefined) return;
    setMarketBusy(true);
    setMarketError(null);
    setMarketSaved(false);
    try {
      const result = await saveMarket(projectId, market);
      if (!result.ok) {
        setMarketError(result.error.message);
        return;
      }
      setMarketSaved(true);
      if (bundle?.ok === true) {
        setBundle({ ...bundle, data: { ...bundle.data, project: result.data } });
      }
    } finally {
      setMarketBusy(false);
    }
  };

  const reset = () => {
    clearBinding();
    setBinding(null);
    setBundle(null);
  };

  if (!hydrated) {
    return (
      <>
        <PipelineNav active="onboarding" />
        <LoadingPanel label="onboarding" />
      </>
    );
  }

  const project = bundle?.ok === true ? bundle.data.project : null;
  const pipeline = bundle?.ok === true ? bundle.data.pipeline : null;
  const hasBaseline =
    pipeline !== null && ["monitoring", "computing", "pending_gate_3", "complete"].includes(pipeline.status);

  return (
    <>
      <PipelineNav active="onboarding" />
      {bundle !== null && !bundle.ok && <ErrorPanel message={bundle.error.message} />}
      <InstallPanel project={project} onStart={start} busy={startBusy} error={startError} />
      {project !== null && (
        <>
          <CrawlProgress pipeline={pipeline} />
          <MarketPanel
            country={project.country}
            language={project.language}
            hasBaseline={hasBaseline}
            onSave={saveMarketFor}
            busy={marketBusy}
            error={marketError}
            saved={marketSaved}
          />
          <p className="muted">
            Working on <strong>{project.brand_name}</strong> ({project.project_id.slice(0, 12)}…) ·{" "}
            <button type="button" className="linklike" onClick={reset}>
              start a different project
            </button>
          </p>
        </>
      )}
    </>
  );
}
