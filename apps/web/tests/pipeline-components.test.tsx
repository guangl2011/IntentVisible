import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrawlProgress } from "../src/app/(dashboard)/pipeline/components/crawl-progress";
import { DataModeHeader, dataModeCopy } from "../src/app/(dashboard)/pipeline/components/data-mode-header";
import { GateReviewPanel } from "../src/app/(dashboard)/pipeline/components/gate-review-panel";
import { GraphPanel } from "../src/app/(dashboard)/pipeline/components/graph-panel";
import { InstallPanel, scriptSnippet } from "../src/app/(dashboard)/pipeline/components/install-panel";
import { LibBrowser } from "../src/app/(dashboard)/pipeline/components/lib-browser";
import { LibPreviewPanel } from "../src/app/(dashboard)/pipeline/components/lib-preview-panel";
import { MarketPanel } from "../src/app/(dashboard)/pipeline/components/market-panel";
import { MetricsDashboard } from "../src/app/(dashboard)/pipeline/components/metrics-dashboard";
import { PipelineNav } from "../src/app/(dashboard)/pipeline/components/pipeline-nav";
import { PromptsPanel } from "../src/app/(dashboard)/pipeline/components/prompts-panel";
import {
  BUYER_INTENT_LIB,
  MARKETING_GRAPH,
  METRICS_SNAPSHOT,
  PIPELINE_PROJECT,
  PROMPT_RECORD,
  PUBLISHED_INTENT,
  UNMEASURED_INTENT_RECORD_V2,
  gateReview,
  pipelineRun,
} from "./pipeline-fixtures";

/**
 * Presentational component states, rendered with react-dom/server: no DOM,
 * no network — the client data path enters at the props boundary with the
 * same wire shapes the API serves (pipeline-fixtures.ts).
 */

describe("PipelineNav", () => {
  it("marks the active page and links the others", () => {
    const html = renderToStaticMarkup(<PipelineNav active="onboarding" />);
    expect(html).toContain("shopify-nav-active");
    expect(html).toContain("Onboarding");
    expect(html).toContain('href="/pipeline/gates"');
    expect(html).toContain('href="/pipeline/library"');
  });
});

describe("onboarding step 1 — install", () => {
  it("starts from the site-URL fallback with all three trigger options", () => {
    const html = renderToStaticMarkup(
      <InstallPanel project={null} onStart={() => {}} busy={false} error={null} />,
    );
    expect(html).toContain("Step 1 — install");
    expect(html).toContain("Shopify app");
    expect(html).toContain("Script snippet");
    expect(html).toContain("Site URL only");
    expect(html).toContain('placeholder="https://www.example.com"');
    expect(html).toContain("Start the pipeline");
  });

  it("shows the copyable snippet for the script trigger", () => {
    const html = renderToStaticMarkup(
      <InstallPanel
        project={{ ...PIPELINE_PROJECT, trigger: "script_install" }}
        onStart={() => {}}
        busy={false}
        error={null}
      />,
    );
    expect(html).toContain("Copy snippet");
    expect(html).toContain("data-site=&quot;www.example.com&quot;");
  });

  it("reports the installed state for the Shopify app trigger", () => {
    const html = renderToStaticMarkup(
      <InstallPanel
        project={{ ...PIPELINE_PROJECT, trigger: "shopify_app" }}
        onStart={() => {}}
        busy={false}
        error={null}
      />,
    );
    expect(html).toContain("Shopify app installed");
  });

  it("builds the snippet with the site host and data-site attribute", () => {
    expect(scriptSnippet("https://www.example.com/store")).toContain('data-site="www.example.com"');
    expect(scriptSnippet("example.com")).toContain('data-site="example.com"');
  });
});

describe("onboarding step 2 — market (Verification #10)", () => {
  it("preselects USA / English by default", () => {
    const html = renderToStaticMarkup(
      <MarketPanel hasBaseline={false} onSave={() => {}} busy={false} error={null} saved={false} />,
    );
    expect(html).toContain("Step 2 — market");
    expect(html).toContain('value="US"');
    expect(html).toContain("United States");
    expect(html).toContain("English");
    expect(html).toContain("United States — English");
  });

  it("shows the stored market when a project exists", () => {
    const html = renderToStaticMarkup(
      <MarketPanel
        country="DE"
        language="de"
        hasBaseline={false}
        onSave={() => {}}
        busy={false}
        error={null}
        saved={false}
      />,
    );
    expect(html).toContain("Germany — German");
  });

  it("surfaces the re-baseline consequence once a baseline exists", () => {
    const html = renderToStaticMarkup(
      <MarketPanel
        country="US"
        language="en"
        hasBaseline={true}
        onSave={() => {}}
        busy={false}
        error={null}
        saved={false}
      />,
    );
    expect(html).toContain("re-baselines monitoring");
    expect(html).toContain("Save market (re-baselines)");
  });

  it("renders all country choices with their languages", () => {
    const html = renderToStaticMarkup(
      <MarketPanel hasBaseline={false} onSave={() => {}} busy={false} error={null} saved={false} />,
    );
    expect(html).toContain('value="CA"');
    expect(html).toContain("Canada");
    expect(html).toContain("Japan");
  });
});

describe("crawl progress", () => {
  it("labels the active stage and shows completed ones", () => {
    const html = renderToStaticMarkup(<CrawlProgress pipeline={pipelineRun("research")} />);
    expect(html).toContain("Pipeline progress");
    expect(html).toContain("stage-done");
    expect(html).toContain("stage-current");
    expect(html).toContain("Market research");
    expect(html).toContain("Gate 3 — publish review");
  });

  it("surfaces the failure state with the typed reason", () => {
    const run = pipelineRun("failed");
    const html = renderToStaticMarkup(
      <CrawlProgress
        pipeline={{ ...run, failure_reason: "crawl_failed", failure_detail: "robots.txt unreachable" }}
      />,
    );
    expect(html).toContain("failed");
    expect(html).toContain("robots.txt unreachable");
  });

  it("renders the empty state before a run exists", () => {
    const html = renderToStaticMarkup(<CrawlProgress pipeline={null} />);
    expect(html).toContain("starts automatically once the install is detected");
  });
});

describe("gate review flow", () => {
  it("renders the pending decision with the 72h auto-proceed note", () => {
    const html = renderToStaticMarkup(
      <GateReviewPanel
        review={gateReview(1, "pending")}
        gate={1}
        timeoutAt="2026-11-04T00:00:00Z"
        onDecide={() => {}}
        busy={false}
        error={null}
      >
        <p>artifact</p>
      </GateReviewPanel>,
    );
    expect(html).toContain("Gate 1 — review");
    expect(html).toContain("auto-proceeds after 2026-11-04");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject with feedback");
  });

  it("shows a decided review with its recorded feedback", () => {
    const html = renderToStaticMarkup(
      <GateReviewPanel
        review={gateReview(2, "rejected")}
        gate={2}
        onDecide={() => {}}
        busy={false}
        error={null}
      >
        <p>artifact</p>
      </GateReviewPanel>,
    );
    expect(html).toContain("rejected");
    expect(html).toContain("Swap the fridge prompt to the overnight scenario.");
  });
});

describe("gate artifacts", () => {
  it("renders the Marketing Graph with competitors, value proposition, and candidate intents", () => {
    const html = renderToStaticMarkup(<GraphPanel graph={MARKETING_GRAPH} />);
    expect(html).toContain("Marketing Graph");
    expect(html).toContain("data mode: llm_estimated");
    expect(html).toContain("EcoFlow");
    expect(html).toContain("Camping Fridge Runtime");
    // The tiers-only rule, verbatim in the render.
    expect(html).toContain("Demand is shown as tiers only");
  });

  it("renders the empty state before the graph exists", () => {
    const html = renderToStaticMarkup(<GraphPanel graph={null} />);
    expect(html).toContain("No Marketing Graph yet");
  });

  it("groups prompts by intent and flags drafts", () => {
    const html = renderToStaticMarkup(<PromptsPanel prompts={[PROMPT_RECORD]} />);
    expect(html).toContain("Expanded prompts");
    expect(html).toContain("int_camping_fridge_runtime");
    expect(html).toContain("1 drafts flagged");
    expect(html).toContain("Which portable power station");
    expect(html).toContain("data mode: llm_simulated");
  });

  it("splits the pre-publish lib into revenue and market expansion with the Data Mode header", () => {
    const html = renderToStaticMarkup(<LibPreviewPanel lib={BUYER_INTENT_LIB} />);
    expect(html).toContain("Data Mode:");
    expect(html).toContain("Revenue expansion");
    expect(html).toContain("Market expansion");
    expect(html).toContain("demand");
  });

  it("renders the lib preview empty state before a monitoring plan exists", () => {
    const html = renderToStaticMarkup(<LibPreviewPanel lib={null} />);
    expect(html).toContain("No lib preview yet");
  });
});

describe("metrics dashboard (Verification #9)", () => {
  it("shows every metric with its provenance line", () => {
    const html = renderToStaticMarkup(<MetricsDashboard snapshots={[METRICS_SNAPSHOT]} />);
    expect(html).toContain("Visibility");
    expect(html).toContain("Leader gap");
    expect(html).toContain("Void rate");
    expect(html).toContain("Top citations");
    expect(html).toContain("Sentiment");
    // Provenance: runs, platform, dates, provider model, data mode.
    expect(html).toContain("9 runs · perplexity · 2026-10-30 → 2026-10-31 · gemini-2.5-pro · data mode: llm_simulated");
    expect(html).toContain("17.5% (behind brand_ecoflow)");
  });

  it("marks stable consensus and renders the Data Mode header once", () => {
    const html = renderToStaticMarkup(<MetricsDashboard snapshots={[METRICS_SNAPSHOT]} />);
    expect(html).toContain("stable");
    expect(html).toContain("Data Mode:");
  });

  it("renders the empty state before metrics exist", () => {
    const html = renderToStaticMarkup(<MetricsDashboard snapshots={[]} />);
    expect(html).toContain("No metrics yet");
  });
});

describe("Data Mode header", () => {
  it("carries the honest simulation caveat", () => {
    expect(dataModeCopy("llm_simulated")).toContain("platform personas approximate");
    expect(dataModeCopy("provider_measured")).toContain("live provider runs");
    const html = renderToStaticMarkup(<DataModeHeader dataMode="llm_simulated" />);
    expect(html).toContain('data-mode="llm_simulated"');
  });
});

describe("lib browser", () => {
  it("renders a published record with status, provenance, and prompts", () => {
    const html = renderToStaticMarkup(<LibBrowser records={[PUBLISHED_INTENT]} />);
    expect(html).toContain("Camping Fridge Runtime");
    expect(html).toContain("simulated");
    expect(html).toContain("Visibility:");
    expect(html).toContain("42.5%");
    expect(html).toContain("Measurement: gemini-2.5-pro");
    expect(html).toContain("1 evidence URLs");
  });

  it("renders measured volumes only when the record carries them", () => {
    const html = renderToStaticMarkup(<LibBrowser records={[PUBLISHED_INTENT]} />);
    expect(html).not.toContain("Monthly search volume");
  });

  it("renders unmeasured records without measurement values or provenance", () => {
    const html = renderToStaticMarkup(
      <LibBrowser
        records={[{ project_id: PUBLISHED_INTENT.project_id, record: UNMEASURED_INTENT_RECORD_V2 }]}
      />,
    );
    expect(html).toContain("not_measured");
    expect(html).not.toContain("Visibility:");
    expect(html).not.toContain("Measurement:");
  });

  it("renders the empty state before anything is published", () => {
    const html = renderToStaticMarkup(<LibBrowser records={[]} />);
    expect(html).toContain("No published intents yet");
  });
});
