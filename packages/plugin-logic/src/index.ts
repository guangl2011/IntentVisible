/**
 * Plugin Phase I logic layer (design v1.4 §1.5–§1.9): performance billing,
 * intent attribution correlation, and connector stubs. Built on the
 * @intentvisible/plugin-schema data model and contracts.
 */

export * from "./errors.js";
export * from "./billing.js";
export * from "./attribution.js";
export * from "./connectors/nango.js";
export * from "./connectors/tregto.js";
