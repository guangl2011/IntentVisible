import { createPipelineClient } from "@intentvisible/client";

/**
 * The pipeline pages' only data path: the typed Pipeline v2 client pointed
 * at the orchestration API. In dev the Next.js rewrite proxies
 * /pipeline-api/* to the API server; in production the base URL comes from
 * the environment. No Prisma, no direct DB access — the same hard
 * constraint the Shopify pages run under.
 */
export function getPipelineClient() {
  return createPipelineClient({
    baseUrl: process.env.NEXT_PUBLIC_PIPELINE_API_BASE ?? "/pipeline-api",
  });
}
