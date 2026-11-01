/**
 * Pipeline v2 REST surface (blueprint art_9zAvKcEq, section C). Mounted from
 * buildApp only when an orchestrator is composed — the v1 analyze surface is
 * untouched. Follows the v1 route conventions: zod-validated bodies, typed
 * error envelopes (invalid_request / not_found / the pipeline's own typed
 * failures), and 202 for accepted async pipeline work.
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  CountryCodeSchema,
  LanguageCodeSchema,
  UrlSchema,
} from "@intentvisible/core-schema";

import type { PipelineOrchestrator } from "./pipeline.js";
import type { PipelineStore } from "./store.js";
import { MixedDataModeError } from "@intentvisible/intent-lib-export";
import { PlanDataModeMismatchError } from "./stage-c.js";
import { PIPELINE_TRIGGERS, type GateNumber } from "./types.js";
import { UsageCapExceeded } from "./usage.js";
import { ProjectValidationError } from "./pipeline.js";

export interface OrchestrationDeps {
  orchestrator: PipelineOrchestrator;
  store: PipelineStore;
}

const GateNumberSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const CreateProjectBodySchema = z.strictObject({
  site_url: UrlSchema,
  brand_name: z.string().min(1).max(120).optional(),
  trigger: z.enum(PIPELINE_TRIGGERS).optional(),
  country: CountryCodeSchema.optional(),
  language: LanguageCodeSchema.optional(),
  data_mode: z.enum(["llm", "measured"]).optional(),
  cadence: z.enum(["weekly", "monthly"]).optional(),
  monthly_llm_request_cap: z.number().int().min(1).nullable().optional(),
  /** Gate numbers to enable; absent = all gates off (the default). */
  gates: z.array(GateNumberSchema).optional(),
});

const UpdateProjectBodySchema = z
  .strictObject({
    site_url: UrlSchema.optional(),
    brand_name: z.string().min(1).max(120).optional(),
    country: CountryCodeSchema.optional(),
    language: LanguageCodeSchema.optional(),
    data_mode: z.enum(["llm", "measured"]).optional(),
    cadence: z.enum(["weekly", "monthly"]).optional(),
    monthly_llm_request_cap: z.number().int().min(1).nullable().optional(),
    gates: z.array(GateNumberSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });

const GateDecisionBodySchema = z.strictObject({ notes: z.string().max(2000).optional() });

function gateConfigFrom(numbers: GateNumber[]): { 1?: boolean; 2?: boolean; 3?: boolean } {
  const config: { 1?: boolean; 2?: boolean; 3?: boolean } = {};
  for (const number of numbers) {
    config[number] = true;
  }
  return config;
}

/** The brand name defaults to the site host (www stripped) when omitted. */
function brandNameFallback(siteUrl: string): string {
  return new URL(siteUrl).hostname.replace(/^www\./, "");
}

/**
 * Typed 4xx mapping: a route handler throws one of these to mean "client-
 * visible failure with a reason" — everything else stays a 500.
 */
const TYPED_ERROR_STATUS: Record<string, number> = {
  [ProjectValidationError.name]: 400,
  [MixedDataModeError.name]: 400,
  [PlanDataModeMismatchError.name]: 400,
  [UsageCapExceeded.name]: 400,
};

export function registerOrchestrationRoutes(
  app: FastifyInstance,
  deps: OrchestrationDeps,
): void {
  const { orchestrator, store } = deps;

  const respond = async (reply: FastifyReply, work: () => Promise<unknown>): Promise<unknown> => {
    try {
      return await reply.send(await work());
    } catch (error) {
      const status = error instanceof Error ? TYPED_ERROR_STATUS[error.name] : undefined;
      if (error instanceof Error && status !== undefined) {
        return await reply
          .code(status)
          .send({ error: { reason: "invalid_request", detail: error.message } });
      }
      throw error;
    }
  };

  app.post("/v2/projects", async (request, reply) => {
    const body = parseBody(CreateProjectBodySchema, request.body);
    if (!body.ok) {
      return typed400(reply, body.error);
    }
    return await respond(reply, async () => {
      const { gates, ...rest } = body.data;
      const project = await orchestrator.createProject({
        ...rest,
        brand_name: rest.brand_name ?? brandNameFallback(rest.site_url),
        trigger: rest.trigger ?? "site_url",
        gate_config: gates === undefined ? undefined : gateConfigFrom(gates),
      });
      const pipeline = await orchestrator.startPipeline(project.project_id, project.trigger);
      return await reply.code(202).send({ project, pipeline });
    });
  });

  const startFromTrigger = (trigger: "shopify_app" | "script_install") => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const projectId = param(request, "project_id");
      return await respond(reply, async () => {
        const project = await orchestrator.getProject(projectId);
        if (project === null) {
          return typed400(reply, {
            error: { reason: "invalid_request", detail: `unknown project ${projectId}` },
          });
        }
        const pipeline = await orchestrator.startPipeline(projectId, trigger);
        return await reply.code(202).send({ project, pipeline });
      });
    };
  };

  app.post("/v2/projects/:project_id/install/shopify", startFromTrigger("shopify_app"));
  app.post("/v2/projects/:project_id/install/script", startFromTrigger("script_install"));

  app.patch("/v2/projects/:project_id", async (request, reply) => {
    const projectId = param(request, "project_id");
    const body = parseBody(UpdateProjectBodySchema, request.body);
    if (!body.ok) {
      return typed400(reply, body.error);
    }
    return await respond(reply, async () => {
      const { gates, ...rest } = body.data;
      return await orchestrator.updateProject(projectId, {
        ...rest,
        gate_config: gates === undefined ? undefined : gateConfigFrom(gates),
      });
    });
  });

  app.get("/v2/projects/:project_id", async (request, reply) => {
    const projectId = param(request, "project_id");
    const project = await orchestrator.getProject(projectId);
    if (project === null) {
      return typed400(reply, {
        error: { reason: "invalid_request", detail: `unknown project ${projectId}` },
      });
    }
    const pipelineRows = await store.listPipelines(projectId);
    const [schedule, cycles, gates, published] = await Promise.all([
      store.getScheduleForProject(projectId),
      store.listCycles(projectId),
      store.listGateReviews({ projectId }),
      store.listPublishedIntents(projectId),
    ]);
    return await reply.send({
      project,
      pipeline: pipelineRows[pipelineRows.length - 1] ?? null,
      schedule,
      cycles,
      gates,
      published,
    });
  });

  const decide = (decision: "approved" | "rejected") => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const gateId = param(request, "gate_id");
      const body = parseBody(GateDecisionBodySchema, request.body ?? {});
      if (!body.ok) {
        return typed400(reply, body.error);
      }
      return await respond(reply, () =>
        orchestrator.decideGate(gateId, decision, body.data.notes),
      );
    };
  };

  app.post("/v2/gates/:gate_id/approve", decide("approved"));
  app.post("/v2/gates/:gate_id/reject", decide("rejected"));

  app.get("/v2/projects/:project_id/published", async (request, reply) => {
    const projectId = param(request, "project_id");
    const project = await orchestrator.getProject(projectId);
    if (project === null) {
      return typed400(reply, {
        error: { reason: "invalid_request", detail: `unknown project ${projectId}` },
      });
    }
    return await reply.send({ records: await store.listPublishedIntents(projectId) });
  });
}

type ParsedBody<T> = { ok: true; data: T } | { ok: false; error: TypedErrorBody };

interface TypedErrorBody {
  error: { reason: string; detail: string };
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): ParsedBody<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue === undefined ? "body" : issue.path.map(String).join(".");
    return {
      ok: false,
      error: { error: { reason: "invalid_request", detail: `${path}: ${issue?.message}` } },
    };
  }
  return { ok: true, data: result.data };
}

/** Route params are guaranteed by the route pattern; a miss is a bug. */
function param(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, string>)[name];
  if (value === undefined) {
    throw new Error(`route param ${name} missing on ${request.url}`);
  }
  return value;
}

function typed400(reply: FastifyReply, body: TypedErrorBody): unknown {
  void reply.code(400);
  return body;
}
