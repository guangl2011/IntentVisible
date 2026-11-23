import { loadResult, type LoadResult } from "../load-result";

export type { LoadResult };

/**
 * Normalization point for the plugin pages' data fetches: results instead
 * of thrown errors, so containers render the failure state without try/catch
 * scatters. The generic runner is shared with the pipeline and Shopify
 * pages (../load-result); the wording here names the plugin API.
 */
export async function loadPlugin<T>(run: () => Promise<T>): Promise<LoadResult<T>> {
  return loadResult(run, {
    notFound: "No plugin shop matches that id — the demo shop is selected when no binding is stored.",
    unreachable: (detail) =>
      detail === null ? "The Plugin API is unreachable." : `The Plugin API is unreachable: ${detail}`,
  });
}
