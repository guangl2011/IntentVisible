/**
 * Plugin Phase I REST surface (design v1.4 §2, testing plan Layer 4).
 * Serves the plugin UI's five modules from the plugin-schema tables over
 * the `PluginReadStore` seam. Follows the repo's route conventions: zod-
 * validated inputs, typed error envelopes ({ error: { reason, detail } }),
 * and structural tenant scoping (every read is bound to one shop id).
 *
 * Data-mode contract (Export Spec v2 conventions): every response carries
 * a `data_mode` header naming the mode of the served data. A client that
 * sends a `data_mode` header gets the data only in that mode — a request
 * for a different mode, or for more than one mode at once, is a typed
 * 400, never a silent cross-mode serving.
 */

import type { IncomingHttpHeaders } from "node:http";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { RUN_DATA_MODES, type RunDataMode } from "@intentvisible/core-schema";

import {
  buildAttribution,
  buildAudit,
  buildBuyerIntents,
  buildCommissionLedger,
  buildMatchView,
  buildOverview,
} from "./compute.js";
import type { PluginReadStore } from "./store.js";

export interface PluginDeps {
  store: PluginReadStore;
  /** The data mode this store serves — llm_simulated for the fixture seed. */
  dataMode: RunDataMode;
  /** Fixed as-of date for deterministic windows (the seed's SEED_AS_OF). */
  asOf: string;
}

type PluginErrorReason = "invalid_request" | "not_found" | "data_mode_mismatch";

const DataModeHeaderSchema = z.enum(RUN_DATA_MODES);

type DataModeParse =
  | { ok: true; requested: RunDataMode | null }
  | { ok: false; detail: string };

function parseDataModeHeader(headers: IncomingHttpHeaders): DataModeParse {
  const raw = headers["data_mode"];
  if (raw === undefined) {
    return { ok: true, requested: null };
  }
  if (Array.isArray(raw)) {
    return {
      ok: false,
      detail: "multiple data_mode headers: one request carries one data mode, never a mix",
    };
  }
  const parsed = DataModeHeaderSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      detail: `data_mode header must be one of: ${RUN_DATA_MODES.join(", ")}`,
    };
  }
  return { ok: true, requested: parsed.data };
}

function pluginFail(
  reply: FastifyReply,
  code: number,
  reason: PluginErrorReason,
  detail: string,
): { error: { reason: PluginErrorReason; detail: string } } {
  void reply.code(code);
  return { error: { reason, detail } };
}

/** Route params are guaranteed by the route pattern; a miss is a bug. */
function param(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, string>)[name];
  if (value === undefined) {
    throw new Error(`route param ${name} missing on ${request.url}`);
  }
  return value;
}

/**
 * Registers the plugin read surface. Every handler runs the same guard:
 * data-mode check → tenant lookup → compute → send with the data_mode
 * header always set, including on error responses.
 */
export function registerPluginRoutes(app: FastifyInstance, deps: PluginDeps): void {
  const guard = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): { ok: true } | { ok: false; body: ReturnType<typeof pluginFail> } => {
    reply.header("data_mode", deps.dataMode);
    const parsed = parseDataModeHeader(request.headers);
    if (!parsed.ok) {
      return { ok: false, body: pluginFail(reply, 400, "invalid_request", parsed.detail) };
    }
    if (parsed.requested !== null && parsed.requested !== deps.dataMode) {
      return {
        ok: false,
        body: pluginFail(
          reply,
          400,
          "data_mode_mismatch",
          `requested data_mode "${parsed.requested}" but this store serves "${deps.dataMode}" — mixed modes are never served`,
        ),
      };
    }
    return { ok: true };
  };

  app.get("/v1/plugin/shops/:shop_id/overview", async (request, reply) => {
    const g = guard(request, reply);
    if (!g.ok) {
      return g.body;
    }
    const shopId = param(request, "shop_id");
    const shop = await deps.store.getShop(shopId);
    if (!shop) {
      return pluginFail(reply, 404, "not_found", `unknown shop id ${shopId}`);
    }
    const [units, sessions, orders, commissions] = await Promise.all([
      deps.store.listIntentUnits(shopId),
      deps.store.listAiReferralSessions(shopId),
      deps.store.listOrders(shopId),
      deps.store.listCommissionEntries(shopId),
    ]);
    return await reply.send(buildOverview({ shopId, units, sessions, orders, commissions, asOf: deps.asOf }));
  });

  app.get("/v1/plugin/shops/:shop_id/intents", async (request, reply) => {
    const g = guard(request, reply);
    if (!g.ok) {
      return g.body;
    }
    const shopId = param(request, "shop_id");
    const shop = await deps.store.getShop(shopId);
    if (!shop) {
      return pluginFail(reply, 404, "not_found", `unknown shop id ${shopId}`);
    }
    const units = await deps.store.listIntentUnits(shopId);
    return await reply.send({ shop_id: shopId, intents: buildBuyerIntents(units) });
  });

  app.get("/v1/plugin/shops/:shop_id/intents/:intent_id", async (request, reply) => {
    const g = guard(request, reply);
    if (!g.ok) {
      return g.body;
    }
    const shopId = param(request, "shop_id");
    const intentId = param(request, "intent_id");
    const shop = await deps.store.getShop(shopId);
    if (!shop) {
      return pluginFail(reply, 404, "not_found", `unknown shop id ${shopId}`);
    }
    const intents = buildBuyerIntents(await deps.store.listIntentUnits(shopId));
    const intent = intents.find((unit) => unit.intent_id === intentId);
    if (!intent) {
      return pluginFail(reply, 404, "not_found", `unknown intent id ${intentId} for shop ${shopId}`);
    }
    return await reply.send(intent);
  });

  app.get("/v1/plugin/shops/:shop_id/attribution", async (request, reply) => {
    const g = guard(request, reply);
    if (!g.ok) {
      return g.body;
    }
    const shopId = param(request, "shop_id");
    const shop = await deps.store.getShop(shopId);
    if (!shop) {
      return pluginFail(reply, 404, "not_found", `unknown shop id ${shopId}`);
    }
    const [units, sessions, orders, commissions] = await Promise.all([
      deps.store.listIntentUnits(shopId),
      deps.store.listAiReferralSessions(shopId),
      deps.store.listOrders(shopId),
      deps.store.listCommissionEntries(shopId),
    ]);
    return await reply.send(buildAttribution({ units, sessions, orders, commissions }));
  });

  app.get("/v1/plugin/shops/:shop_id/audit", async (request, reply) => {
    const g = guard(request, reply);
    if (!g.ok) {
      return g.body;
    }
    const shopId = param(request, "shop_id");
    const shop = await deps.store.getShop(shopId);
    if (!shop) {
      return pluginFail(reply, 404, "not_found", `unknown shop id ${shopId}`);
    }
    const [units, commissions] = await Promise.all([
      deps.store.listIntentUnits(shopId),
      deps.store.listCommissionEntries(shopId),
    ]);
    return await reply.send(buildAudit({ units, commissions }));
  });

  app.get("/v1/plugin/shops/:shop_id/match", async (request, reply) => {
    const g = guard(request, reply);
    if (!g.ok) {
      return g.body;
    }
    const shopId = param(request, "shop_id");
    const shop = await deps.store.getShop(shopId);
    if (!shop) {
      return pluginFail(reply, 404, "not_found", `unknown shop id ${shopId}`);
    }
    const [visits, orders, commissions] = await Promise.all([
      deps.store.listAffiliateVisits(shopId),
      deps.store.listOrders(shopId),
      deps.store.listCommissionEntries(shopId),
    ]);
    return await reply.send(buildMatchView({ visits, orders, commissions, dataMode: deps.dataMode }));
  });

  app.get("/v1/plugin/shops/:shop_id/commission", async (request, reply) => {
    const g = guard(request, reply);
    if (!g.ok) {
      return g.body;
    }
    const shopId = param(request, "shop_id");
    const shop = await deps.store.getShop(shopId);
    if (!shop) {
      return pluginFail(reply, 404, "not_found", `unknown shop id ${shopId}`);
    }
    const [orders, commissions] = await Promise.all([
      deps.store.listOrders(shopId),
      deps.store.listCommissionEntries(shopId),
    ]);
    return await reply.send(buildCommissionLedger({ orders, commissions }));
  });
}
