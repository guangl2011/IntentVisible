/**
 * packages/intent-lib-export — deterministic Buyer Intent Lib renderer
 * (blueprint Stage C.3/C.4; Export Spec v2). Pure rendering over stored
 * pipeline records: visibility ≥30% floor, Revenue/Market split at 50%,
 * grouping and sorting by intent, a single YAML header block carrying the
 * Data Mode, and per-record data_mode + provenance end to end. No LLM
 * calls, no network, no I/O.
 */

export {
  LIB_EXPORT_ERROR_CODES,
  LibExportError,
  LibInputError,
  LibValidationError,
  MixedDataModeError,
  PooledSnapshotMissingError,
  type LibExportErrorCode,
} from "./errors.js";
export {
  buildLibExport,
  formatDate,
  formatVisibilityPct,
  pooledSnapshotFor,
} from "./build.js";
export { renderDocumentExport, validateDocumentExport, DOCUMENT_SEPARATOR } from "./document.js";
export {
  parseYamlExport,
  renderYamlExport,
  toYamlView,
  VISIBILITY_STRING_PATTERN,
  YamlExportSchema,
  YamlRecordSchema,
  type YamlExport,
  type YamlRecord,
} from "./yaml.js";
export {
  EXPORT_SPEC_NAME,
  REVENUE_SPLIT_THRESHOLD_PCT,
  VISIBILITY_FLOOR_PCT,
  type BuyerIntentLib,
  type ExpansionSection,
  type ExcludedPromptCounts,
  type LibExportInput,
  type LibIntent,
  type LibPrompt,
} from "./types.js";
