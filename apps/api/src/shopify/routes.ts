/**
 * The merchant surfaces (spec D2): install + callback, sync/generate job
 * endpoints, catalog/library reads, and the HMAC-verified webhook intake.
 * Follows the analyze surface's route conventions (typed error bodies,
 * 202-and-poll for jobs); every data route is merchant-scoped through the
 * bound store handle, never by call-site filters.
 */

import type { IncomingHttpHeaders } from "node:http";

import fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";

import {
  BUYER_STAGES,
  CountryCodeSchema,
  INTENT_CATEGORIES,
  LanguageCodeSchema,
  SCOPES,
} from "@intentvisible/core-schema";
import {
  buildInstallUrl,
  exchangeCodeForToken,
  isMyShopifyDomain,
  isShopifyConnectorError,
  isSupportedWebhookTopic,
  numericIdFromShopifyId,
  verifyOAuthCallback,
  verifyWebhook,
  type OAuthCallbackQuery,
  type ShopifyOAuthConfig,
  type VerifiedWebhook,
  type WebhookTopic,
} from "@intentvisible/shopify-connector";
import type { RawBodyRequest } from "../raw-body.js";
import { registerRawBodyParser } from "../raw-body.js";
import { encryptToken } from "./secrets.js";
import type { ShopifyJobFailureReason, ShopifyJobRecord } from "./jobs.js";
import {
  createShopifyJob,
  runCatalogSyncJob,
  runIntentGenerationJob,
  type ShopifyApiDeps,
} from "./runner.js";
import {
  merchantIdFromShopDomain,
  type IntentLibraryFilters,
  type MappingRow,
} from "./store.js";

/** Route error vocabulary: job reasons plus the install/webhook codes. */
export type ShopifyRouteErrorReason =
  | ShopifyJobFailureReason
  | "hmac_rejected"
  | "state_mismatch"
  | "oauth_failed";

export interface ShopifyTypedError {
  error: { reason: ShopifyRouteErrorReason; detail: string };
}

const InstallBodySchema = z.strictObject({ shop: z.string().min(1) });

const IntentFiltersQuerySchema = z.strictObject({
  scope: z.enum(SCOPES).optional(),
  buyer_stage: z.enum(BUYER_STAGES).optional(),
  intent_category: z.enum(INTENT_CATEGORIES).optional(),
  country: CountryCodeSchema.optional(),
  language: LanguageCodeSchema.optional(),
});

type ParsedBody<T> = { ok: true; data: T } | { ok: false; error: ShopifyTypedError };

/**
 * Body/query validation as a discriminated union — malformed input is a
 * typed 400, never a 500 (mirrors the analyze surface's parseBody).
 */
function parseWith<T>(schema: z.ZodType<T>, input: unknown): ParsedBody<T> {
  try {
    const result = schema.safeParse(input);
    if (!result.success) {
      return { ok: false, error: typedError("invalid_request", firstIssue(result.error)) };
    }
    return { ok: true, data: result.data };
  } catch (error) {
    return {
      ok: false,
      error: typedError("invalid_request", error instanceof Error ? error.message : String(error)),
    };
  }
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) {
    return error.message;
  }
  const path = issue.path.map(String).join(".");
  return `${path === "" ? "body" : path}: ${issue.message}`;
}

function typedError(reason: ShopifyRouteErrorReason, detail: string): ShopifyTypedError {
  return { error: { reason, detail } };
}

function sendError(reply: FastifyReply, body: ShopifyTypedError, code: number): ShopifyTypedError {
  void reply.code(code);
  return body;
}

/** Route params are guaranteed by the route pattern; a miss is a bug. */
function param(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, string>)[name];
  if (value === undefined) {
    throw new Error(`route param ${name} missing on ${request.url}`);
  }
  return value;
}

/** Per-shop OAuth config — the credential is passed through, never stored. */
function oauthConfig(deps: ShopifyApiDeps, shopDomain: string): ShopifyOAuthConfig {
  return {
    storeId: merchantIdFromShopDomain(shopDomain),
    clientId: deps.config.clientId,
    clientSecret: deps.config.clientSecret,
    shopDomain,
    redirectUri: deps.config.redirectUri,
  };
}

/** verifyWebhook takes flat string headers; request.headers values may be
 * string[] | undefined — keep the string-valued ones (the HMAC headers are). */
function stringHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      flat[name] = value;
    }
  }
  return flat;
}

/**
 * Registers the merchant routes. The jobs route is registered separately
 * (registerShopifyJobRoute) because the composed server's shared
 * /v1/jobs/:job_id route must check both the analyze and shopify stores.
 */
export function registerShopifyRoutes(app: FastifyInstance, deps: ShopifyApiDeps): void {
  // ── Install: begin the OAuth authorization-code grant ──
  app.post("/v1/install", async (request, reply) => {
    const body = parseWith(InstallBodySchema, request.body);
    if (!body.ok) {
      return sendError(reply, body.error, 400);
    }
    const shop = body.data.shop.toLowerCase();
    if (!isMyShopifyDomain(shop)) {
      return sendError(
        reply,
        typedError("invalid_request", `shop must be a {slug}.myshopify.com domain, got "${shop}"`),
        400,
      );
    }

    const { installUrl, state } = buildInstallUrl(oauthConfig(deps, shop));
    // The nonce is stored per install attempt and consumed on first use.
    await deps.store.saveOAuthState(shop, state);
    return await reply.code(201).send({ store_id: merchantIdFromShopDomain(shop), install_url: installUrl });
  });

  // ── Install: verify the callback (state → HMAC → shop → code) ──
  app.get("/v1/install/callback", async (request, reply) => {
    const query = request.query as OAuthCallbackQuery;
    const shop = query.shop ?? "";
    const expectedState = await deps.store.getOAuthState(shop);

    let code: string;
    try {
      const verified = verifyOAuthCallback(oauthConfig(deps, shop), {
        query,
        expectedState,
      });
      code = verified.code;
    } catch (error) {
      if (!isShopifyConnectorError(error)) {
        throw error;
      }
      const code401 = error.code === "hmac_rejected" || error.code === "state_mismatch";
      return sendError(reply, typedError(error.code, error.message), code401 ? 401 : 502);
    }

    let exchanged: Awaited<ReturnType<typeof exchangeCodeForToken>>;
    try {
      exchanged = await exchangeCodeForToken(oauthConfig(deps, shop), code, {
        postJson: deps.postJson,
      });
    } catch (error) {
      // The exchange is an upstream rejection — 502, typed as oauth_failed.
      if (isShopifyConnectorError(error) && error.code === "oauth_failed") {
        return sendError(reply, typedError("oauth_failed", error.message), 502);
      }
      throw error;
    }

    const now = new Date().toISOString();
    await deps.store.upsertMerchant({
      id: merchantIdFromShopDomain(shop),
      shop_domain: shop,
      connected: true,
      encrypted_access_token: encryptToken(exchanged.accessToken, deps.config.tokenKey),
      granted_scopes: exchanged.scopes,
      // brand_profile is owned by saveBrandProfile — a re-install never
      // wipes it (the store's conflict path preserves it).
      brand_profile: null,
      created_at: now,
      updated_at: now,
    });
    // Single-use consumption: a replayed callback has no pending nonce.
    await deps.store.consumeOAuthState(shop);
    return await reply.send({
      store_id: merchantIdFromShopDomain(shop),
      shop_domain: shop,
      connected: true,
    });
  });

  // ── Sync / generate: enqueue jobs on the in-process queue ──
  const enqueue = async (
    request: FastifyRequest,
    reply: FastifyReply,
    kind: "catalog_sync" | "intent_generation",
  ): Promise<unknown> => {
    const storeId = param(request, "id");
    const merchant = await deps.store.getMerchant(storeId);
    if (merchant === null) {
      return sendError(
        reply,
        typedError("not_found", `unknown store id ${storeId}`),
        404,
      );
    }
    const job = await createShopifyJob(deps.store, storeId, kind);
    deps.queue.enqueue(() => runShopifyJob(deps, job));
    return await reply.code(202).send({ job_id: job.job_id, status: job.status });
  };

  app.post("/v1/stores/:id/sync", async (request, reply) => {
    return await enqueue(request, reply, "catalog_sync");
  });

  app.post("/v1/stores/:id/generate", async (request, reply) => {
    return await enqueue(request, reply, "intent_generation");
  });

  // ── Catalog + library reads ──
  const unknownStore = (reply: FastifyReply, storeId: string): ShopifyTypedError =>
    sendError(reply, typedError("not_found", `unknown store id ${storeId}`), 404);

  app.get("/v1/stores/:id/products", async (request, reply) => {
    const storeId = param(request, "id");
    const merchant = await deps.store.getMerchant(storeId);
    if (merchant === null) {
      return unknownStore(reply, storeId);
    }
    const products = await deps.store.forMerchant(storeId).listProducts();
    return await reply.send({
      store_id: storeId,
      products: products.map((row) => ({ ...row.payload, deleted_at: row.deleted_at })),
    });
  });

  app.get("/v1/stores/:id/intents", async (request, reply) => {
    const storeId = param(request, "id");
    const merchant = await deps.store.getMerchant(storeId);
    if (merchant === null) {
      return unknownStore(reply, storeId);
    }
    const filtersResult = IntentFiltersQuerySchema.safeParse(request.query);
    if (!filtersResult.success) {
      return sendError(reply, typedError("invalid_request", firstIssue(filtersResult.error)), 400);
    }
    const filters: IntentLibraryFilters = filtersResult.data;
    const intents = await deps.store.forMerchant(storeId).listIntents(filters);
    return await reply.send({ store_id: storeId, intents: intents.map((row) => row.record) });
  });

  app.get("/v1/stores/:id/mappings", async (request, reply) => {
    const storeId = param(request, "id");
    const merchant = await deps.store.getMerchant(storeId);
    if (merchant === null) {
      return unknownStore(reply, storeId);
    }
    const mappings = await deps.store.forMerchant(storeId).listMappings();
    return await reply.send({ store_id: storeId, mappings: mappingViews(mappings) });
  });

  // ── Webhook intake: verify BEFORE any body processing ──
  app.post("/v1/webhooks/shopify", async (request, reply) => {
    const raw = (request as RawBodyRequest).rawBody;
    if (raw === undefined) {
      return sendError(
        reply,
        typedError("invalid_request", "webhook delivery carried no raw body to verify"),
        400,
      );
    }

    let verified: VerifiedWebhook;
    try {
      verified = verifyWebhook({
        clientSecret: deps.config.clientSecret,
        headers: stringHeaders(request.headers),
        rawBody: raw,
      });
    } catch (error) {
      if (!isShopifyConnectorError(error) || error.code !== "hmac_rejected") {
        throw error;
      }
      // A failed signature check writes nothing — no dedup row, no work.
      return sendError(reply, typedError("hmac_rejected", error.message), 401);
    }

    // Replay protection before any processing: a delivery id already
    // recorded is a duplicate — 200, no work, no state change.
    if (verified.webhookId !== undefined) {
      const fresh = await deps.store.recordWebhookDelivery({
        webhookId: verified.webhookId,
        topic: verified.topic,
        shopDomain: verified.shopDomain,
        processedAt: new Date().toISOString(),
      });
      if (!fresh) {
        return await reply.code(200).send({ status: "duplicate" });
      }
    }

    if (!isSupportedWebhookTopic(verified.topic)) {
      return await reply.code(200).send({ status: "ignored" });
    }

    // The verified delivery reaches the queue; Shopify gets its 202
    // immediately (dedup already recorded — see the runner's note on
    // processing-crash behavior).
    const topic = verified.topic;
    deps.queue.enqueue(() => processWebhookTopic(deps, topic, verified));
    return await reply.code(202).send({ status: "accepted", topic });
  });
}

/**
 * The shared job route for a standalone Shopify app instance. The composed
 * server registers the analyze app's /v1/jobs/:job_id with a shopify
 * fallback instead (single route, two stores behind it).
 */
export function registerShopifyJobRoute(app: FastifyInstance, deps: ShopifyApiDeps): void {
  app.get("/v1/jobs/:job_id", async (request, reply) => {
    const jobId = param(request, "job_id");
    const job = await deps.store.getJob(jobId);
    if (job === null) {
      return sendError(
        reply,
        typedError("not_found", `unknown job id ${jobId}`),
        404,
      );
    }
    return await reply.send(job);
  });
}

/** A standalone Shopify app: fresh Fastify instance, raw-body parser, all routes. */
export function buildShopifyApp(deps: ShopifyApiDeps): FastifyInstance {
  const app = fastify();

  app.setNotFoundHandler((_request, reply) => {
    return sendError(reply, typedError("not_found", "unknown route"), 404);
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    const reason: ShopifyRouteErrorReason = status < 500 ? "invalid_request" : "internal_error";
    return sendError(reply, typedError(reason, error.message), status);
  });

  registerRawBodyParser(app);
  registerShopifyRoutes(app, deps);
  registerShopifyJobRoute(app, deps);
  return app;
}

// ── Webhook topic handlers (queued work) ───────────────────────────────────

/**
 * Processes a verified, non-duplicate delivery. Failures propagate to the
 * queue's onError hook (never swallowed); the delivery id is already
 * recorded, so a processing crash loses the event — recoverable for both
 * topics here (app state reconciles on the next sync/install) and noted
 * in the PR.
 */
async function processWebhookTopic(
  deps: ShopifyApiDeps,
  topic: WebhookTopic,
  verified: VerifiedWebhook,
): Promise<void> {
  if (verified.shopDomain === undefined) {
    return;
  }
  const merchant = await deps.store.getMerchantByShopDomain(verified.shopDomain);
  if (merchant === null) {
    return; // delivery for a store never installed here
  }
  const at = new Date().toISOString();

  if (topic === "app/uninstalled") {
    await deps.store.upsertMerchant({
      ...merchant,
      connected: false,
      updated_at: at,
    });
    return;
  }

  if (topic === "products/delete") {
    const productId = productIdFromPayload(verified.payload);
    if (productId === undefined) {
      return; // verified source sent an unusable payload — nothing to map
    }
    const scoped = deps.store.forMerchant(merchant.id);
    const deleted = await scoped.markProductDeleted(productId, at);
    if (!deleted) {
      return; // unknown product or already deleted — nothing to invalidate
    }
    // Soft, versioned teardown: mappings invalidate (timestamped), and
    // intents citing the product's SKUs version-bump without them —
    // no silent deletes anywhere.
    const products = await scoped.listProducts();
    const product = products.find((row) => row.product_id === productId);
    const skuIds = product?.payload.skus.map((sku) => sku.sku_id) ?? [];
    await scoped.invalidateProductMappings(productId, at);
    await scoped.removeSkuReferences(skuIds);
    return;
  }

  // products/update: verified and accepted, but resync-on-update is not
  // in this slice — the merchant's next explicit sync picks it up.
}

/**
 * The products/delete payload's product id: REST numeric id or Admin gid.
 */
export function productIdFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const id = record.id;
  if (typeof id === "number" && Number.isInteger(id) && id > 0) {
    return `product_${id}`;
  }
  if (typeof id === "string") {
    const numeric = numericIdFromShopifyId(id);
    if (numeric !== undefined) {
      return `product_${numeric}`;
    }
  }
  const gid = record.admin_graphql_api_id;
  if (typeof gid === "string") {
    const numeric = numericIdFromShopifyId(gid);
    if (numeric !== undefined) {
      return `product_${numeric}`;
    }
  }
  return undefined;
}

/** Mapping rows as the API view: contract payload + invalidation state. */
function mappingViews(mappings: MappingRow[]) {
  return mappings.map((row) => ({
    ...row.payload,
    active: row.active,
    invalidated_at: row.invalidated_at,
  }));
}

/** Enqueues one job's runner closure by kind. */
function runShopifyJob(deps: ShopifyApiDeps, job: ShopifyJobRecord): Promise<void> {
  return job.kind === "catalog_sync"
    ? runCatalogSyncJob(deps, job)
    : runIntentGenerationJob(deps, job);
}
