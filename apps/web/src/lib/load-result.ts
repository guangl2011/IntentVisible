/**
 * The single normalization point for page data fetches: every loader returns
 * a result instead of throwing, so containers can render the error state
 * without try/catch scatters. Callers word the failure for their surface
 * (the Shopify pages say "Shopify API"; the pipeline pages say "Pipeline API").
 */

import { NotFoundError } from "@intentvisible/client";

export type LoadErrorKind = "not_found" | "unavailable" | "invalid_input";

export interface LoadError {
  kind: LoadErrorKind;
  message: string;
}

export type LoadResult<T> = { ok: true; data: T } | { ok: false; error: LoadError };

export async function loadResult<T>(
  run: () => Promise<T>,
  labels: { notFound: string; unreachable: (detail: string | null) => string },
): Promise<LoadResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      return { ok: false, error: { kind: "not_found", message: labels.notFound } };
    }
    return {
      ok: false,
      error: {
        kind: "unavailable",
        message: labels.unreachable(error instanceof Error ? error.message : null),
      },
    };
  }
}
