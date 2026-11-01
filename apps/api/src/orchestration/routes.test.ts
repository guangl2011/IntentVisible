/**
 * Route tests for the v2 gate/dashboard read surface (task todo_odH85qmF).
 * The routes are mounted over a MemoryPipelineStore seeded with the
 * core-schema fixture world; a stub orchestrator answers getProject. Every
 * assertion runs against HTTP responses via app.inject — no live LLM, no
 * crawl, no network.
 */

import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  MarketingGraphSchema,
  MetricsSnapshotSchema,
  PromptRecordSchema,
} from "@intentvisible/core-schema";
import {
  exampleMarketingGraph,
  exampleMetricsSnapshot,
  examplePromptRecord,
} from "@intentvisible/core-schema/testing-v2";
import { MonitoringPlanSchema } from "@intentvisible/intent-engine";

import { MemoryPipelineStore } from "./store.js";
import type { PipelineOrchestrator } from "./pipeline.js";
import { registerOrchestrationRoutes } from "./routes.js";
import type {
  PipelineProjectRecord,
  PipelineRecord,
} from "./types.js";

const TIMESTAMP = "2026-11-01T00:00:00Z";
const PROJECT_ID = "proj_solix";
const BRAND_ID = "brand_solix";
const PLAN_ID = "plan_graph_solix_2026q4_v1";

function fixtureProject(): PipelineProjectRecord {
  return {
    project_id: PROJECT_ID,
    brand_id: BRAND_ID,
    brand_name: "Solix",
    site_url: "https://www.example.com",
    trigger: "site_url",
    country: "US",
    language: "en",
    gate_config: { 1: true, 2: true, 3: true },
    data_mode: "llm",
    monthly_llm_request_cap: null,
    cadence: "monthly",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };
}

function fixturePipeline(): PipelineRecord {
  return {
    pipeline_id: "pipe_1",
    project_id: PROJECT_ID,
    status: "pending_gate_3",
    status_history: [{ status: "installed", at: TIMESTAMP }],
    plan_id: PLAN_ID,
    trigger: "site_url",
    failure_reason: null,
    failure_detail: null,
    published: false,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };
}

function fixturePlan() {
  return MonitoringPlanSchema.parse({
    schema_version: "2.0.0",
    plan_id: PLAN_ID,
    brand_id: BRAND_ID,
    graph_id: "graph_solix_2026q4",
    graph_version: 1,
    platforms: ["perplexity"],
    runs_per_prompt: 3,
    baseline_rounds: 3,
    cadence: "monthly",
    prompt_ids: ["prompt_fridge_runtime_overnight"],
    country: "US",
    language: "en",
    data_mode: "llm_simulated",
    created_at: TIMESTAMP,
    provenance: { source: "gemini-2.5-pro", retrieved_at: TIMESTAMP },
  });
}

/** Pooled per-prompt snapshot (platform absent) — the export's join key. */
function pooledPerPromptSnapshot() {
  return MetricsSnapshotSchema.parse({
    ...exampleMetricsSnapshot,
    metrics_id: "mtrc_fridge_runtime_pooled_prompt",
    platform: undefined,
  });
}

/** Pooled per-intent snapshot (prompt_id absent) — the dashboard's row unit. */
function pooledPerIntentSnapshot() {
  return MetricsSnapshotSchema.parse({
    ...exampleMetricsSnapshot,
    metrics_id: "mtrc_fridge_runtime_pooled_intent",
    prompt_id: undefined,
    platform: undefined,
  });
}

/**
 * The orchestrator is stubbed to just the read the routes make of it
 * (getProject); the store is the real MemoryPipelineStore, so the new
 * endpoints are tested against their actual data plumbing.
 */
function stubOrchestrator(project: PipelineProjectRecord | null): PipelineOrchestrator {
  return {
    getProject: async (projectId: string) => (projectId === project?.project_id ? project : null),
  } as unknown as PipelineOrchestrator;
}

async function makeApp(seed?: (store: MemoryPipelineStore) => Promise<void>): Promise<{
  app: FastifyInstance;
  store: MemoryPipelineStore;
}> {
  const store = new MemoryPipelineStore();
  if (seed) await seed(store);
  const app = Fastify();
  registerOrchestrationRoutes(app, {
    orchestrator: stubOrchestrator(fixtureProject()),
    store,
  });
  await app.ready();
  return { app, store };
}

async function seedWorld(store: MemoryPipelineStore): Promise<void> {
  await store.saveProject(fixtureProject());
  await store.savePipeline(fixturePipeline());
  await store.savePlan(fixturePlan());
  await store.saveGraph(MarketingGraphSchema.parse(exampleMarketingGraph));
  await store.savePrompts(BRAND_ID, [
    PromptRecordSchema.parse(examplePromptRecord),
  ]);
  await store.saveMetrics(PLAN_ID, [pooledPerPromptSnapshot(), pooledPerIntentSnapshot()]);
}

describe("gate/dashboard read routes", () => {
  it("serves the stored marketing graph for Gate 1", async () => {
    const { app } = await makeApp(seedWorld);

    const response = await app.inject({ method: "GET", url: `/v2/projects/${PROJECT_ID}/graph` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { graph: { graph_id: string } | null };
    expect(body.graph?.graph_id).toBe("graph_solix_2026q4");
  });

  it("serves graph: null before Stage A has produced one", async () => {
    const { app } = await makeApp(async (store) => {
      await store.saveProject(fixtureProject());
    });

    const response = await app.inject({ method: "GET", url: `/v2/projects/${PROJECT_ID}/graph` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ graph: null });
  });

  it("serves the expanded prompts for Gate 2", async () => {
    const { app } = await makeApp(seedWorld);

    const response = await app.inject({ method: "GET", url: `/v2/projects/${PROJECT_ID}/prompts` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { prompts: Array<{ prompt_id: string }> };
    expect(body.prompts).toHaveLength(1);
    expect(body.prompts[0]!.prompt_id).toBe("prompt_fridge_runtime_overnight");
  });

  it("serves pooled metrics snapshots with provenance for the dashboard", async () => {
    const { app } = await makeApp(seedWorld);

    const response = await app.inject({ method: "GET", url: `/v2/projects/${PROJECT_ID}/metrics` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { snapshots: Array<Record<string, unknown>> };
    expect(body.snapshots).toHaveLength(2);
    for (const snapshot of body.snapshots) {
      // Provenance block mandatory on every published metric (Verification #5).
      expect(snapshot.data_mode).toBe("llm_simulated");
      expect(snapshot.run_count).toBe(9);
      expect(snapshot.provider_model).toBe("gemini-2.5-pro");
    }
  });

  it("serves an empty metrics list before a plan exists", async () => {
    const { app } = await makeApp(async (store) => {
      await store.saveProject(fixtureProject());
    });

    const response = await app.inject({ method: "GET", url: `/v2/projects/${PROJECT_ID}/metrics` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ snapshots: [] });
  });

  it("renders the pre-publish lib for Gate 3 from stored records only", async () => {
    const { app } = await makeApp(seedWorld);

    const response = await app.inject({
      method: "GET",
      url: `/v2/projects/${PROJECT_ID}/lib-preview`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { lib: { dataMode: string; exportSpec: string } | null };
    // The example prompt is a draft — the export keeps it out, so the
    // preview renders with an empty intent list but still carries the
    // Data Mode header (the mode check runs before the floor filters).
    expect(body.lib?.dataMode).toBe("llm_simulated");
    expect(body.lib?.exportSpec).toBe("Buyer Intent GEO Export v2");
  });

  it("serves lib: null before a monitoring plan exists", async () => {
    const { app } = await makeApp(async (store) => {
      await store.saveProject(fixtureProject());
    });

    const response = await app.inject({
      method: "GET",
      url: `/v2/projects/${PROJECT_ID}/lib-preview`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lib: null });
  });

  it("serves lib: null when a plan exists but monitoring has not produced metrics yet", async () => {
    const { app } = await makeApp(async (store) => {
      await store.saveProject(fixtureProject());
      await store.savePipeline(fixturePipeline());
      await store.savePlan(fixturePlan());
      await store.saveGraph(MarketingGraphSchema.parse(exampleMarketingGraph));
    });

    const response = await app.inject({
      method: "GET",
      url: `/v2/projects/${PROJECT_ID}/lib-preview`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lib: null });
  });

  it("rejects reads for unknown projects with the typed 400 envelope", async () => {
    const { app } = await makeApp();

    for (const path of ["/graph", "/prompts", "/metrics", "/lib-preview"]) {
      const response = await app.inject({ method: "GET", url: `/v2/projects/proj_missing${path}` });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { reason: "invalid_request", detail: "unknown project proj_missing" },
      });
    }
  });
});
