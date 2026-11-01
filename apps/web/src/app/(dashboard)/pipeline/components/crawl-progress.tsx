import type { PipelineRun } from "@intentvisible/client";

/**
 * Crawl/pipeline progress: the orchestration lifecycle as an ordered stage
 * list with the current stage highlighted. Pure mapping — presentational.
 */

const STAGE_ORDER = [
  "installed",
  "crawling",
  "research",
  "modeling",
  "estimating",
  "pending_gate_1",
  "selecting",
  "expanding",
  "pending_gate_2",
  "monitoring",
  "computing",
  "pending_gate_3",
  "complete",
] as const;

const STAGE_LABELS: Readonly<Record<(typeof STAGE_ORDER)[number], string>> = {
  installed: "Installed",
  crawling: "Crawling your site",
  research: "Market research",
  modeling: "Modeling the Marketing Graph",
  estimating: "Estimating demand",
  pending_gate_1: "Gate 1 — graph review",
  selecting: "Selecting intents",
  expanding: "Expanding prompts",
  pending_gate_2: "Gate 2 — prompt review",
  monitoring: "Running the baseline",
  computing: "Computing metrics",
  pending_gate_3: "Gate 3 — publish review",
  complete: "Complete — lib published",
};

export interface StageProgress {
  stages: Array<{ status: string; label: string; state: "done" | "current" | "upcoming" }>;
  failed: boolean;
}

/** Maps a pipeline run to the ordered stage display; unknown statuses mark failure. */
export function stageProgress(run: PipelineRun | null): StageProgress {
  if (run === null || run.status === "failed") {
    return { stages: [], failed: true };
  }
  const currentIndex = STAGE_ORDER.indexOf(run.status as (typeof STAGE_ORDER)[number]);
  const stages = STAGE_ORDER.map((status, index) => ({
    status,
    label: STAGE_LABELS[status],
    state: index < currentIndex ? ("done" as const) : index === currentIndex ? ("current" as const) : ("upcoming" as const),
  }));
  return { stages, failed: false };
}

export function CrawlProgress({ pipeline }: { pipeline: PipelineRun | null }) {
  const progress = stageProgress(pipeline);
  if (pipeline === null) {
    return (
      <div className="card">
        <strong>Pipeline</strong>
        <p className="muted">The pipeline starts automatically once the install is detected.</p>
      </div>
    );
  }
  if (progress.failed) {
    return (
      <div className="card failure-card" role="alert">
        <strong>The pipeline run failed.</strong>
        <p className="muted">
          {pipeline.failure_reason ?? "unknown reason"}
          {pipeline.failure_detail !== null ? ` — ${pipeline.failure_detail}` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className="card">
      <strong>Pipeline progress</strong>
      <ol className="stage-list" aria-label="Pipeline stages">
        {progress.stages.map((stage) => (
          <li key={stage.status} className={`stage-${stage.state}`}>
            {stage.label}
            {stage.state === "current" ? <span className="badge badge-PENDING_APPROVAL">now</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
