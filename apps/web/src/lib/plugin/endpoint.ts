import { createPluginClient, type PluginApiClient } from "./client";

/**
 * The plugin pages' data-path entry point, mirroring the pipeline and
 * Shopify clients: the rewrite proxies /plugin-api/* in dev; production
 * sets NEXT_PUBLIC_PLUGIN_API_BASE and no rewrite is needed.
 */
export function getPluginClient(): PluginApiClient {
  return createPluginClient(process.env.NEXT_PUBLIC_PLUGIN_API_BASE ?? "/plugin-api");
}
