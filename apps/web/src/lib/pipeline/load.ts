import { loadResult, type LoadError, type LoadErrorKind, type LoadResult } from "../load-result";

export type { LoadError, LoadErrorKind, LoadResult };

/**
 * Normalization point for the pipeline pages' data fetches: results instead
 * of thrown errors, so containers render the failure state without try/catch
 * scatters. The generic runner is shared with the Shopify pages
 * (../load-result); the wording here names the pipeline API.
 */
export async function loadPipeline<T>(run: () => Promise<T>): Promise<LoadResult<T>> {
  return loadResult(run, {
    notFound: "No pipeline project matches that id — start onboarding again to create one.",
    unreachable: (detail) =>
      detail === null ? "The Pipeline API is unreachable." : `The Pipeline API is unreachable: ${detail}`,
  });
}
