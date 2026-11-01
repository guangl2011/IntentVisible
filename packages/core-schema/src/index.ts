/**
 * Intent Schema v1 — the contract package.
 *
 * Consumers use the Zod schemas for runtime validation and the generated
 * contract types; non-TS consumers use the JSON Schema files under
 * schemas/ (exposed via the "./schemas/*" export). Schemas change only in
 * dedicated PRs (plan section 10, principle 3).
 */

export * from "./enums.js";
export * from "./enums-v2.js";
export * from "./version.js";
export * from "./primitives.js";
export * from "./primitives-v2.js";
export * from "./intent-record.js";
export * from "./intent-record-v2.js";
export * from "./brand-profile.js";
export * from "./product-profile.js";
export * from "./sku-intent-mapping.js";
export * from "./persona.js";
export * from "./scenario.js";
export * from "./prompt-record.js";
export * from "./monitoring-run.js";
export * from "./metrics-snapshot.js";
export * from "./marketing-graph.js";
export * from "./legacy-mapping.js";

export type {
  BrandProfile,
  IntentRecord,
  ProductProfile,
  SkuIntentMapping,
  Persona,
  Scenario,
  PromptRecord,
  MonitoringRun,
  MetricsSnapshot,
  MarketingGraph,
  IntentRecordV2,
  // Shared v2 defs (defined once per generated module; re-exported here exactly once).
  Provenance,
  Trait,
  CitationShare,
  CompetitorNode,
  DemandEstimate,
  FitEstimate,
  GapEstimate,
  IntentTopicNode,
  MeasurementProvenance,
} from "./generated/index.js";
