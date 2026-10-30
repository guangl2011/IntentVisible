/**
 * The minimal REST surface (spec art_KGYzMB5Z, API table). Analyze POSTs
 * return { job_id } immediately; failure reasons surface through the job
 * state machine with typed payloads, never as untyped 500s. Endpoints the
 * plan reserves for later packages (matching, diagnosis, Visible import)
 * are deliberately absent here.
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastify from "fastify";

import {
  BUYER_STAGES,
  BrandIdSchema,
  CountryCodeSchema,
  INTENT_CATEGORIES,
  LanguageCodeSchema,
  UrlSchema,
} from "@intentvisible/core-schema";

import type { IntentFilters, JobStore, LibraryStore } from "./store.js";
import type { AnalyzePipeline } from "./pipeline.js";
import type { JobFailureReason } from "./types.js";

export interface ApiDeps {
  pipeline: AnalyzePipeline;
  jobStore: JobStore;
  libraryStore: LibraryStore;
}

const MarketsSchema = z
  .array(z.strictObject({ country: CountryCodeSchema, language: LanguageCodeSchema }))
  .min(1)
  .max(10);

const BrandAnalyzeBodySchema = z.strictObject({
  url: UrlSchema,
  markets: MarketsSchema.optional(),
});

const ProductAnalyzeBodySchema = BrandAnalyzeBodySchema.extend({
  brand_id: BrandIdSchema.optional(),
});

const IntentFiltersQuerySchema = z.strictObject({
  buyer_stage: z.enum(BUYER_STAGES).optional(),
  intent_category: z.enum(INTENT_CATEGORIES).optional(),
  country: CountryCodeSchema.optional(),
  language: LanguageCodeSchema.optional(),
});

/** One typed failure shape for every error response the API emits. */
export interface TypedErrorBody {
  error: { reason: JobFailureReason; detail: string };
}

type ParsedBody<T> = { ok: true; data: T } | { ok: false; error: TypedErrorBody };

/**
 * Body validation as a discriminated union. Validation runs on untrusted
 * input, and a schema refinement can itself throw on malformed values
 * (the core-schema UrlSchema refine calls `new URL`) — any error raised
 * while validating a request body is a validation failure, so it
 * surfaces as a typed 400 rather than a 500.
 */
function parseBody<T>(schema: z.ZodType<T>, body: unknown): ParsedBody<T> {
  try {
    const result = schema.safeParse(body);
    if (!result.success) {
      return { ok: false, error: failBody("invalid_request", firstIssue(result.error)) };
    }
    return { ok: true, data: result.data };
  } catch (error) {
    return {
      ok: false,
      error: failBody("invalid_request", error instanceof Error ? error.message : String(error)),
    };
  }
}

export function buildApp(deps: ApiDeps): FastifyInstance {
  const app = fastify();

  app.setNotFoundHandler((_request, reply) => {
    return fail(reply, 404, "not_found", "unknown route");
  });

  // Last resort: an escaped error must still be typed, never a raw 500.
  app.setErrorHandler((error, _request, reply) => {
    return fail(reply, 500, "internal_error", error instanceof Error ? error.message : String(error));
  });

  app.post("/v1/brands/analyze", async (request, reply) => {
    const body = parseBody(BrandAnalyzeBodySchema, request.body);
    if (!body.ok) {
      return sendError(reply, body.error, 400);
    }
    const job = await deps.pipeline.createJob("brand", body.data.url);
    return await reply.code(202).send({ job_id: job.job_id });
  });

  app.post("/v1/products/analyze", async (request, reply) => {
    const body = parseBody(ProductAnalyzeBodySchema, request.body);
    if (!body.ok) {
      return sendError(reply, body.error, 400);
    }
    const job = await deps.pipeline.createJob("product", body.data.url, body.data.brand_id);
    return await reply.code(202).send({ job_id: job.job_id });
  });

  app.get("/v1/jobs/:job_id", async (request, reply) => {
    const jobId = param(request, "job_id");
    const job = await deps.jobStore.getJob(jobId);
    if (!job) {
      return sendError(reply, failBody("not_found", `unknown job id ${jobId}`), 404);
    }
    return await reply.send(job);
  });

  app.get("/v1/brands/:brand_id/intents", async (request, reply) => {
    return await serveIntents(deps, request, reply, "brand");
  });

  app.get("/v1/products/:product_id/intents", async (request, reply) => {
    return await serveIntents(deps, request, reply, "product");
  });

  return app;
}

/**
 * Shared read path: 404 for unknown ids; otherwise the available intents
 * (possibly empty while a job is still running) with the latest job's
 * state visible — the partially-complete read (spec Flow, Read row).
 */
async function serveIntents(
  deps: ApiDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  kind: "brand" | "product",
): Promise<unknown> {
  const id = param(request, kind === "brand" ? "brand_id" : "product_id");

  const filtersResult = IntentFiltersQuerySchema.safeParse(request.query);
  if (!filtersResult.success) {
    return sendError(reply, failBody("invalid_request", firstIssue(filtersResult.error)), 400);
  }
  const filters: IntentFilters = filtersResult.data;

  const profile =
    kind === "brand"
      ? await deps.libraryStore.getBrandProfile(id)
      : await deps.libraryStore.getProductProfile(id);
  if (!profile) {
    return sendError(reply, failBody("not_found", `unknown ${kind} id ${id}`), 404);
  }

  // Partially complete: profiles register at extraction time, so a brand
  // can be readable while its job is still generating or has failed.
  const job =
    kind === "brand"
      ? await deps.jobStore.latestJobForBrand(id)
      : await deps.jobStore.latestJobForProduct(id);

  const intents =
    kind === "brand"
      ? await deps.libraryStore.listBrandIntents(id, filters)
      : await deps.libraryStore.listProductIntents(id, filters);

  return await reply.send({ [`${kind}_id`]: id, job, intents });
}

/** Route params are guaranteed by the route pattern; a miss is a bug. */
function param(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, string>)[name];
  if (value === undefined) {
    throw new Error(`route param ${name} missing on ${request.url}`);
  }
  return value;
}

function failBody(reason: JobFailureReason, detail: string): TypedErrorBody {
  return { error: { reason, detail } };
}

/** Builds a typed body with the status code set on the reply. */
function fail(
  reply: FastifyReply,
  code: number,
  reason: JobFailureReason,
  detail: string,
): TypedErrorBody {
  return sendError(reply, failBody(reason, detail), code);
}

function sendError(reply: FastifyReply, body: TypedErrorBody, code: number): TypedErrorBody {
  void reply.code(code);
  return body;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) {
    return error.message;
  }
  const path = issue.path.map(String).join(".");
  return `${path === "" ? "body" : path}: ${issue.message}`;
}
