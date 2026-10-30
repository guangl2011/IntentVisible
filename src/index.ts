/**
 * Slugify arbitrary text into a URL-safe slug.
 *
 * Pure function: input in, output out. Non-string input and input without
 * any alphanumeric characters are rejected with TypeError / RangeError,
 * so callers never receive a silently-empty slug.
 */
export function slugify(input: unknown): string {
  if (typeof input !== "string") {
    throw new TypeError(
      `slugify expects a string, received ${input === null ? "null" : typeof input}`,
    );
  }

  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new RangeError(
      "slugify expects input containing at least one alphanumeric character",
    );
  }

  return slug;
}

// deliberate lint error (revert me)
const unusedVariable = 123;
