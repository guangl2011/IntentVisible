/**
 * Pipeline persistence seam (same pattern as the v1 JobStore): a narrow
 * interface the orchestrator talks to, with an in-memory implementation for
 * tests and dev. A Drizzle/Postgres implementation can slot in later without
 * touching the orchestration logic.
 */

import type {
  MetricsSnapshot,
  MonitoringRun,
  MarketingGraph,
  PromptRecord,
} from "@intentvisible/core-schema";
import type { MonitoringPlan } from "@intentvisible/intent-engine";

import type {
  BaselineRecord,
  GateReviewRecord,
  LibPublishRecord,
  MonitoringCycleRecord,
  MonitoringScheduleRecord,
  NotificationRecord,
  PipelineProjectRecord,
  PipelineRecord,
  PublishedIntentRecord,
} from "./types.js";

export type GateReviewStatus = GateReviewRecord["status"];

/** All pipeline state for one project, persisted as one unit of reads/writes. */
export interface PipelineStore {
  // projects & pipelines
  saveProject(project: PipelineProjectRecord): Promise<void>;
  getProject(projectId: string): Promise<PipelineProjectRecord | null>;
  savePipeline(pipeline: PipelineRecord): Promise<void>;
  getPipeline(pipelineId: string): Promise<PipelineRecord | null>;
  listPipelines(projectId: string): Promise<PipelineRecord[]>;

  // gate reviews
  saveGateReview(review: GateReviewRecord): Promise<void>;
  getGateReview(reviewId: string): Promise<GateReviewRecord | null>;
  listGateReviews(filter: { projectId?: string; pipelineId?: string; status?: GateReviewStatus }): Promise<
    GateReviewRecord[]
  >;

  // pipeline artifacts (latest per kind; superseded only by a re-baseline)
  saveGraph(graph: MarketingGraph): Promise<void>;
  getGraph(brandId: string): Promise<MarketingGraph | null>;
  savePrompts(brandId: string, prompts: PromptRecord[]): Promise<void>;
  getPrompts(brandId: string): Promise<PromptRecord[]>;
  savePlan(plan: MonitoringPlan): Promise<void>;
  getPlan(planId: string): Promise<MonitoringPlan | null>;

  // monitoring data (per plan — a market change creates a new plan, never mixes)
  saveBaseline(baseline: BaselineRecord): Promise<void>;
  listBaselines(projectId: string): Promise<BaselineRecord[]>;
  saveRuns(planId: string, runs: MonitoringRun[]): Promise<void>;
  getRuns(planId: string): Promise<MonitoringRun[]>;
  saveMetrics(planId: string, metrics: MetricsSnapshot[]): Promise<void>;
  getMetrics(planId: string): Promise<MetricsSnapshot[]>;

  // scheduler, usage, notifications, cycles, publish
  saveSchedule(schedule: MonitoringScheduleRecord): Promise<void>;
  getScheduleForProject(projectId: string): Promise<MonitoringScheduleRecord | null>;
  listDueSchedules(nowIso: string): Promise<MonitoringScheduleRecord[]>;
  saveCycle(cycle: MonitoringCycleRecord): Promise<void>;
  listCycles(projectId: string): Promise<MonitoringCycleRecord[]>;
  addUsage(projectId: string, monthKey: string, requests: number): Promise<void>;
  getUsage(projectId: string, monthKey: string): Promise<number>;
  addNotification(notification: NotificationRecord): Promise<void>;
  listNotifications(projectId: string): Promise<NotificationRecord[]>;
  savePublish(publish: LibPublishRecord): Promise<void>;
  listPublishes(projectId: string): Promise<LibPublishRecord[]>;
  savePublishedIntents(intents: PublishedIntentRecord[]): Promise<void>;
  listPublishedIntents(projectId: string): Promise<PublishedIntentRecord[]>;
}

interface PlanArtifacts {
  graph: MarketingGraph;
  prompts: PromptRecord[];
  plan: MonitoringPlan;
}

/** Deterministic in-memory implementation (tests + dev). */
export class MemoryPipelineStore implements PipelineStore {
  private readonly projects = new Map<string, PipelineProjectRecord>();
  private readonly pipelines = new Map<string, PipelineRecord>();
  private readonly gateReviews = new Map<string, GateReviewRecord>();
  /** brand_id → latest pipeline artifacts. */
  private readonly graphs = new Map<string, MarketingGraph>();
  private readonly promptsByBrand = new Map<string, PromptRecord[]>();
  /** plan_id → plan; plan_id embeds graph+version so re-baselines never collide. */
  private readonly plans = new Map<string, MonitoringPlan>();
  private readonly planArtifacts = new Map<string, PlanArtifacts>();
  private readonly baselines: BaselineRecord[] = [];
  private readonly runsByPlan = new Map<string, MonitoringRun[]>();
  private readonly metricsByPlan = new Map<string, MetricsSnapshot[]>();
  private readonly schedules = new Map<string, MonitoringScheduleRecord>();
  private readonly cycles: MonitoringCycleRecord[] = [];
  private readonly usage = new Map<string, number>();
  private readonly notifications: NotificationRecord[] = [];
  private readonly publishes: LibPublishRecord[] = [];
  private readonly publishedIntents: PublishedIntentRecord[] = [];

  async saveProject(project: PipelineProjectRecord): Promise<void> {
    this.projects.set(project.project_id, { ...project });
  }

  async getProject(projectId: string): Promise<PipelineProjectRecord | null> {
    return this.projects.get(projectId) ?? null;
  }

  async savePipeline(pipeline: PipelineRecord): Promise<void> {
    this.pipelines.set(pipeline.pipeline_id, { ...pipeline });
  }

  async getPipeline(pipelineId: string): Promise<PipelineRecord | null> {
    return this.pipelines.get(pipelineId) ?? null;
  }

  async listPipelines(projectId: string): Promise<PipelineRecord[]> {
    return [...this.pipelines.values()]
      .filter((pipeline) => pipeline.project_id === projectId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async saveGateReview(review: GateReviewRecord): Promise<void> {
    this.gateReviews.set(review.review_id, { ...review });
  }

  async getGateReview(reviewId: string): Promise<GateReviewRecord | null> {
    return this.gateReviews.get(reviewId) ?? null;
  }

  async listGateReviews(filter: {
    projectId?: string;
    pipelineId?: string;
    status?: GateReviewStatus;
  }): Promise<GateReviewRecord[]> {
    return [...this.gateReviews.values()]
      .filter(
        (review) =>
          (filter.projectId === undefined || review.project_id === filter.projectId) &&
          (filter.pipelineId === undefined || review.pipeline_id === filter.pipelineId) &&
          (filter.status === undefined || review.status === filter.status),
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async saveGraph(graph: MarketingGraph): Promise<void> {
    this.graphs.set(graph.brand_id, { ...graph });
  }

  async getGraph(brandId: string): Promise<MarketingGraph | null> {
    return this.graphs.get(brandId) ?? null;
  }

  async savePrompts(brandId: string, prompts: PromptRecord[]): Promise<void> {
    this.promptsByBrand.set(brandId, prompts.map((prompt) => ({ ...prompt })));
  }

  async getPrompts(brandId: string): Promise<PromptRecord[]> {
    return [...(this.promptsByBrand.get(brandId) ?? [])];
  }

  async savePlan(plan: MonitoringPlan): Promise<void> {
    this.plans.set(plan.plan_id, { ...plan });
  }

  async getPlan(planId: string): Promise<MonitoringPlan | null> {
    return this.plans.get(planId) ?? null;
  }

  /** Keeps the artifacts a plan's baseline was built from (per-plan, market-scoped). */
  savePlanArtifacts(plan: MonitoringPlan, graph: MarketingGraph, prompts: PromptRecord[]): void {
    this.planArtifacts.set(plan.plan_id, { graph, prompts, plan });
  }

  getPlanArtifacts(planId: string): PlanArtifacts | null {
    return this.planArtifacts.get(planId) ?? null;
  }

  async saveBaseline(baseline: BaselineRecord): Promise<void> {
    this.baselines.push({ ...baseline });
  }

  async listBaselines(projectId: string): Promise<BaselineRecord[]> {
    return this.baselines.filter((baseline) => baseline.project_id === projectId);
  }

  async saveRuns(planId: string, runs: MonitoringRun[]): Promise<void> {
    const existing = this.runsByPlan.get(planId) ?? [];
    this.runsByPlan.set(planId, [...existing, ...runs.map((run) => ({ ...run }))]);
  }

  async getRuns(planId: string): Promise<MonitoringRun[]> {
    return [...(this.runsByPlan.get(planId) ?? [])];
  }

  async saveMetrics(planId: string, metrics: MetricsSnapshot[]): Promise<void> {
    this.metricsByPlan.set(planId, metrics.map((snapshot) => ({ ...snapshot })));
  }

  async getMetrics(planId: string): Promise<MetricsSnapshot[]> {
    return [...(this.metricsByPlan.get(planId) ?? [])];
  }

  async saveSchedule(schedule: MonitoringScheduleRecord): Promise<void> {
    this.schedules.set(schedule.schedule_id, { ...schedule });
  }

  async getScheduleForProject(projectId: string): Promise<MonitoringScheduleRecord | null> {
    for (const schedule of this.schedules.values()) {
      if (schedule.project_id === projectId) {
        return schedule;
      }
    }
    return null;
  }

  async listDueSchedules(nowIso: string): Promise<MonitoringScheduleRecord[]> {
    return [...this.schedules.values()]
      .filter((schedule) => schedule.status === "active" && schedule.next_run_at <= nowIso)
      .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at));
  }

  async saveCycle(cycle: MonitoringCycleRecord): Promise<void> {
    // Upsert by id: a cycle is saved at start (status "monitoring") and
    // again on completion — the store must not duplicate it.
    const index = this.cycles.findIndex((existing) => existing.cycle_id === cycle.cycle_id);
    if (index >= 0) {
      this.cycles[index] = { ...cycle };
    } else {
      this.cycles.push({ ...cycle });
    }
  }

  async listCycles(projectId: string): Promise<MonitoringCycleRecord[]> {
    return this.cycles.filter((cycle) => cycle.project_id === projectId);
  }

  async addUsage(projectId: string, monthKey: string, requests: number): Promise<void> {
    const key = `${projectId}|${monthKey}`;
    this.usage.set(key, (this.usage.get(key) ?? 0) + requests);
  }

  async getUsage(projectId: string, monthKey: string): Promise<number> {
    return this.usage.get(`${projectId}|${monthKey}`) ?? 0;
  }

  async addNotification(notification: NotificationRecord): Promise<void> {
    this.notifications.push({ ...notification });
  }

  async listNotifications(projectId: string): Promise<NotificationRecord[]> {
    return this.notifications.filter((notification) => notification.project_id === projectId);
  }

  async savePublish(publish: LibPublishRecord): Promise<void> {
    this.publishes.push({ ...publish });
  }

  async listPublishes(projectId: string): Promise<LibPublishRecord[]> {
    return this.publishes.filter((publish) => publish.project_id === projectId);
  }

  /** Upsert by (project, intent): a re-publish replaces the record and bumps the version. */
  async savePublishedIntents(intents: PublishedIntentRecord[]): Promise<void> {
    for (const entry of intents) {
      const index = this.publishedIntents.findIndex(
        (existing) =>
          existing.project_id === entry.project_id && existing.record.intent_id === entry.record.intent_id,
      );
      if (index >= 0) {
        this.publishedIntents[index] = { ...entry };
      } else {
        this.publishedIntents.push({ ...entry });
      }
    }
  }

  async listPublishedIntents(projectId: string): Promise<PublishedIntentRecord[]> {
    return this.publishedIntents
      .filter((entry) => entry.project_id === projectId)
      .sort((a, b) => a.record.intent_id.localeCompare(b.record.intent_id));
  }
}
