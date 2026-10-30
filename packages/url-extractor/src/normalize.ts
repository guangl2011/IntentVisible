import { createHash } from "node:crypto";

/**
 * HTML normalization for content hashing (spec Data contract).
 *
 * The hash keys incremental refresh — an unchanged hash lets later packages
 * skip regeneration — so normalization must be deterministic across fetches
 * of equivalent content: line endings collapse, and horizontal whitespace
 * runs collapse. The snapshot itself always stores the raw bytes.
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** SHA-256 hex digest of normalized HTML. */
export function contentHash(normalizedHtml: string): string {
  return createHash("sha256").update(normalizedHtml, "utf8").digest("hex");
}

/** Convenience: normalize then hash in one step. */
export function hashHtml(rawHtml: string): string {
  return contentHash(normalizeHtml(rawHtml));
}
