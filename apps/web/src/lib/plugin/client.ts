/**
 * The plugin pages' only data path: typed reads against the plugin Phase I
 * endpoints (apps/api/src/plugin/routes.ts). In dev the Next.js rewrite
 * proxies /plugin-api/* to the API server (default port 4310); in production
 * the base URL comes from the environment. No Prisma, no direct DB access —
 * the same hard constraint the Shopify and pipeline pages run under.
 *
 * Every response carries a `data_mode` header naming the mode of the served
 * data; this client reads it and hands it back with the payload, so every
 * page can render the simulated/measured separation next to the numbers.
 */

import { NetworkError, NotFoundError, UnexpectedStatusError } from "@intentvisible/client";

import type {
  AttributionPayload,
  AuditPayload,
  BuyerIntentPayload,
  CommissionLedgerPayload,
  MatchPayload,
  OverviewPayload,
  RunDataMode,
} from "./types";

/** A payload plus the data mode the API served it in. */
export interface PluginRead<T> {
  dataMode: RunDataMode;
  payload: T;
}

export interface PluginApiClient {
  overview(shopId: string): Promise<PluginRead<OverviewPayload>>;
  intents(shopId: string): Promise<PluginRead<BuyerIntentPayload[]>>;
  intent(shopId: string, intentId: string): Promise<PluginRead<BuyerIntentPayload>>;
  attribution(shopId: string): Promise<PluginRead<AttributionPayload>>;
  audit(shopId: string): Promise<PluginRead<AuditPayload>>;
  match(shopId: string): Promise<PluginRead<MatchPayload>>;
  commission(shopId: string): Promise<PluginRead<CommissionLedgerPayload>>;
}

interface ErrorEnvelope {
  error: { reason: string; detail: string };
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as ErrorEnvelope).error?.detail === "string"
  );
}

function dataModeFrom(headers: Headers): RunDataMode {
  const raw = headers.get("data_mode");
  return raw === "provider_measured" ? "provider_measured" : "llm_simulated";
}

/**
 * One fetch + guard for every read: parse the data_mode header, map the
 * route's typed error envelope onto the shared client error hierarchy.
 */
async function pluginGet<T>(baseUrl: string, path: string): Promise<PluginRead<T>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`);
  } catch (cause) {
    throw new NetworkError("connection failed", { cause });
  }
  if (response.ok) {
    return { dataMode: dataModeFrom(response.headers), payload: (await response.json()) as T };
  }
  const body: unknown = await response.json().catch(() => null);
  const detail = isErrorEnvelope(body) ? `${body.error.reason}: ${body.error.detail}` : `status ${response.status}`;
  if (response.status === 404) {
    throw new NotFoundError(response.status, "not_found", body, detail);
  }
  throw new UnexpectedStatusError(response.status, "plugin_error", body, detail);
}

export function createPluginClient(baseUrl: string): PluginApiClient {
  const get = <T>(path: string) => () => pluginGet<T>(baseUrl, path);
  return {
    overview: (shopId) => get<OverviewPayload>(`/v1/plugin/shops/${shopId}/overview`)(),
    // The list route is the one enveloped body ({ shop_id, intents }); unwrap
    // it here so pages receive the bare array like every other read.
    intents: async (shopId) => {
      const read = await get<{ shop_id: string; intents: BuyerIntentPayload[] }>(
        `/v1/plugin/shops/${shopId}/intents`,
      )();
      return { dataMode: read.dataMode, payload: read.payload.intents };
    },
    intent: (shopId, intentId) => get<BuyerIntentPayload>(`/v1/plugin/shops/${shopId}/intents/${intentId}`)(),
    attribution: (shopId) => get<AttributionPayload>(`/v1/plugin/shops/${shopId}/attribution`)(),
    audit: (shopId) => get<AuditPayload>(`/v1/plugin/shops/${shopId}/audit`)(),
    match: (shopId) => get<MatchPayload>(`/v1/plugin/shops/${shopId}/match`)(),
    commission: (shopId) => get<CommissionLedgerPayload>(`/v1/plugin/shops/${shopId}/commission`)(),
  };
}
