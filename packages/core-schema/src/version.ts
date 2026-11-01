/**
 * Schema versioning rules (SemVer discipline, spec art_KGYzMB5Z).
 *
 * The major version gates compatibility: a major bump is the signal for a
 * breaking contract change, and schema changes land only in dedicated PRs
 * (plan section 10, principle 3). Consumers reject records whose major is
 * not the supported one, so minor/patch additions flow through without
 * code changes.
 */

/** Current version of the Intent Schema contract published by this package. */
export const SCHEMA_VERSION = "1.0.0";

/** The only major version readers of this package accept. */
export const SUPPORTED_SCHEMA_MAJOR = 1;

/**
 * JSON-Schema-ready pattern for a compatible schema_version: SemVer
 * X.Y.Z with no leading zeros and the major pinned to 1. Kept as a string
 * so the Zod schema and the JSON Schema files share one source (parity
 * tests enforce the sync).
 */
export const SCHEMA_VERSION_PATTERN = "^1\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$";

/** Generic SemVer pattern (any major, no leading zeros) used for parsing. */
const SEMVER_PATTERN = "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$";

export interface SchemaVersionParts {
  major: number;
  minor: number;
  patch: number;
}

/** Parses a SemVer X.Y.Z string; returns null when it is not one. */
export function parseSchemaVersion(version: string): SchemaVersionParts | null {
  const match = new RegExp(SEMVER_PATTERN).exec(version);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** True when a record's schema_version can be read by consumers of this contract. */
export function isSchemaVersionCompatible(version: string): boolean {
  const parts = parseSchemaVersion(version);
  return parts !== null && parts.major === SUPPORTED_SCHEMA_MAJOR;
}

/**
 * Pipeline v2 contract (blueprint art_9zAvKcEq), published alongside v1 —
 * never instead of it: v1 records stay valid and map to v2 values at read
 * time (legacy-mapping.ts), so no stored data is rewritten.
 */
export const SCHEMA_VERSION_V2 = "2.0.0";

/** The only major version readers of the v2 pipeline schemas accept. */
export const SUPPORTED_SCHEMA_MAJOR_V2 = 2;

/**
 * JSON-Schema-ready pattern for a v2-compatible schema_version: SemVer
 * X.Y.Z with the major pinned to 2. Kept as a string so the Zod schemas
 * and the v2 JSON Schema files share one source (parity tests enforce the
 * sync).
 */
export const SCHEMA_VERSION_PATTERN_V2 = "^2\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$";

/** True when a record's schema_version can be read by consumers of the v2 pipeline contract. */
export function isSchemaVersionCompatibleV2(version: string): boolean {
  const parts = parseSchemaVersion(version);
  return parts !== null && parts.major === SUPPORTED_SCHEMA_MAJOR_V2;
}
