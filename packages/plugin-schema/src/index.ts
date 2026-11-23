/**
 * Plugin Phase I data model (design v1.4 §1.5, scopes ①–④).
 *
 * Exports the Drizzle tables, the write-path contracts, and the shared
 * vocabularies. Demo seed data lives behind the "./seed" export.
 */

export * from "./enums.js";
export * from "./contracts.js";
export * from "./schema.js";
export * from "./client.js";
