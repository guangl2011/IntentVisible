/**
 * Lowercase ASCII slug: the stable-id material for intent ids.
 *
 * Mirror of the importer's slugify (packages/intent-importer) so generated
 * and imported ids look identical; duplicated rather than imported because
 * the engine must not depend on the importer package (the dependency runs
 * the other way: the API layer consumes both).
 */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}
