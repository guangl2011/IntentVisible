import { NotFoundError } from "@intentvisible/client";

/**
 * A single normalization point for page data fetches: every loader returns
 * a result instead of throwing, so containers can render the error state
 * (404 → the store id is wrong; anything else → the API is unreachable)
 * without try/catch scatters.
 */
export type LoadErrorKind = "not_found" | "unavailable" | "invalid_input";

export interface LoadError {
  kind: LoadErrorKind;
  message: string;
}

export type LoadResult<T> = { ok: true; data: T } | { ok: false; error: LoadError };

export async function loadPage<T>(run: () => Promise<T>): Promise<LoadResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      return {
        ok: false,
        error: { kind: "not_found", message: "No store matches that id — reconnect to get a fresh one." },
      };
    }
    return {
      ok: false,
      error: {
        kind: "unavailable",
        message:
          error instanceof Error
            ? `The Shopify API is unreachable: ${error.message}`
            : "The Shopify API is unreachable.",
      },
    };
  }
}
