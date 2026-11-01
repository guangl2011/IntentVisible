import { loadResult, type LoadError, type LoadErrorKind, type LoadResult } from "../load-result";

export type { LoadError, LoadErrorKind, LoadResult };

/**
 * A single normalization point for the Shopify pages' data fetches: every
 * loader returns a result instead of throwing, so containers can render the
 * error state (404 → the store id is wrong; anything else → the API is
 * unreachable) without try/catch scatters. Failure wording lives here;
 * the generic runner is shared with the pipeline pages (../load-result).
 */
export async function loadPage<T>(run: () => Promise<T>): Promise<LoadResult<T>> {
  return loadResult(run, {
    notFound: "No store matches that id — reconnect to get a fresh one.",
    unreachable: (detail) =>
      detail === null ? "The Shopify API is unreachable." : `The Shopify API is unreachable: ${detail}`,
  });
}
