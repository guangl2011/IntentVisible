/**
 * Solix rows → Intent Schema v1 records.
 *
 * Every row is either imported as a schema-valid IntentRecord or reported
 * as failed with a typed reason — nothing invalid is stored and no field is
 * silently dropped (spec art_KGYzMB5Z acceptance criteria).
 */

import {
  INTENT_CATEGORIES,
  BUYER_STAGES,
  SCHEMA_VERSION,
  IntentRecordSchema,
  type IntentCategory,
  type BuyerStage,
  type IntentRecord,
} from "@intentvisible/core-schema";

import { IMPORTED_RECORD_DEFAULTS, SOLIX_FIELD_MAP, type SolixField } from "./field-map.js";

/** One input row: canonical Solix column name → raw cell value. */
export type SolixRow = Record<string, string | undefined>;

export interface ImportOptions {
  /**
   * Header aliases for the real Solix export, keyed by canonical field
   * name. Importing the real file must be a config change, not a code
   * change — add aliases here, not if-branches in the parser.
   */
  columnAliases?: Partial<Record<SolixField, string>>;
}

export interface RowError {
  row: number;
  field?: string;
  reason: string;
}

export interface DroppedColumn {
  column: string;
  rowCount: number;
  reason: string;
}

export interface ImportReport {
  /** Total input rows, including failed ones. */
  rowCount: number;
  /** Records that passed schema validation. */
  imported: number;
  failedRows: RowError[];
  /** Columns present in the input that produced no record field. */
  unmappedColumns: DroppedColumn[];
}

export interface ImportResult {
  records: IntentRecord[];
  report: ImportReport;
}

/** Resolves the input column name for a canonical Solix field. */
function resolveColumnName(field: SolixField, options: ImportOptions): string {
  return options.columnAliases?.[field] ?? field;
}

/** Lowercase ASCII slug: the stable-id material for intent/brand/sku ids. */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

/** Case-insensitive match against a schema vocabulary, or null. */
function matchEnum<T extends string>(raw: string, vocabulary: readonly T[]): T | null {
  const needle = raw.trim().toLowerCase();
  return vocabulary.find((value) => value.toLowerCase() === needle) ?? null;
}

/** Extracts http(s) URLs from a free-form cell (semicolon/space/newline separated). */
function extractUrls(raw: string): string[] {
  return raw
    .split(/[;\s]+/)
    .map((token) => token.trim())
    .filter((token) => /^https?:\/\//i.test(token));
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

interface RowFields {
  intentName: string;
  prompts: string[];
  buyerStage: BuyerStage;
  intentCategory: IntentCategory;
  painPoint: string | undefined;
  persona: string | undefined;
  language: string;
  country: string;
  brand: string;
  recommendedContent: string | undefined;
  recommendedCta: string | undefined;
  visibilityPct: number | null;
  monthlySearchVolume: number | null;
  measurementSource: string | null;
  evidenceUrls: string[];
  scope: "brand" | "product" | undefined;
  skuIds: string[];
}

/**
 * Normalizes one raw row. Throws a FieldError with the responsible column
 * so the caller can report the failure against the row.
 */
class FieldError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
  }
}

function normalizeRow(row: SolixRow, options: ImportOptions): RowFields {
  const get = (field: SolixField): string | undefined =>
    row[resolveColumnName(field, options)]?.trim();
  const require = (field: SolixField): string => {
    const value = get(field);
    if (value === undefined || value === "") {
      throw new FieldError(field, "required field is missing or empty");
    }
    return value;
  };

  const buyerStage = matchEnum(require("Buyer Stage"), BUYER_STAGES);
  if (buyerStage === null) {
    throw new FieldError(
      "Buyer Stage",
      `not in the Intent Schema v1 vocabulary (${BUYER_STAGES.join(", ")})`,
    );
  }
  const intentCategory = matchEnum(require("Intent Category"), INTENT_CATEGORIES);
  if (intentCategory === null) {
    throw new FieldError(
      "Intent Category",
      `not in the Intent Schema v1 vocabulary (${INTENT_CATEGORIES.join(", ")})`,
    );
  }

  const language = get("Language")?.toLowerCase() ?? "";
  if (!/^[a-z]{2}$/.test(language)) {
    throw new FieldError("Language", "must be an ISO 639-1 two-letter code");
  }
  const country = get("Country")?.toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new FieldError("Country", "must be an ISO 3166-1 alpha-2 code");
  }

  const evidenceUrls = extractUrls(get("Source") ?? "");
  if (evidenceUrls.length === 0) {
    throw new FieldError(
      "Source",
      "no http(s) evidence URL found — the importer never invents evidence",
    );
  }

  const skuIds = (get("SKU IDs") ?? "")
    .split(/[;\s]+/)
    .filter((token) => token !== "")
    .map((token) => `sku_${slugify(token.replace(/^sku_/i, ""))}`);

  const scopeColumn = get("Scope");
  let scope: "brand" | "product" | undefined;
  if (scopeColumn !== undefined) {
    const scopeValue = matchEnum(scopeColumn, ["brand", "product"] as const);
    if (scopeValue === null) {
      throw new FieldError("Scope", "must be 'brand' or 'product'");
    }
    scope = scopeValue;
  }

  const visibilityPct = toNumberOrNull(get("Visibility (%)"));
  if (visibilityPct !== null && (visibilityPct < 0 || visibilityPct > 100)) {
    throw new FieldError("Visibility (%)", "must be between 0 and 100");
  }
  const monthlySearchVolume = toNumberOrNull(get("Monthly Search Volume"));
  if (monthlySearchVolume !== null && !Number.isInteger(monthlySearchVolume)) {
    throw new FieldError("Monthly Search Volume", "must be an integer");
  }

  return {
    intentName: require("Intent Name"),
    prompts: [require("Prompt")],
    buyerStage,
    intentCategory,
    painPoint: get("Pain Point"),
    persona: get("Persona"),
    language,
    country,
    brand: require("Brand"),
    recommendedContent: get("Recommended Content"),
    recommendedCta: get("Recommended CTA"),
    visibilityPct,
    monthlySearchVolume,
    measurementSource: get("Source Models") ?? null,
    evidenceUrls,
    scope,
    skuIds,
  };
}

/** Builds the schema-valid record for one merged intent. */
function toIntentRecord(fields: RowFields): IntentRecord {
  const scope = fields.scope ?? (fields.skuIds.length > 0 ? "product" : "brand");
  const record = {
    schema_version: SCHEMA_VERSION,
    intent_id: `int_${slugify(fields.intentName)}`,
    intent_version: 1,
    scope,
    brand_id: `brand_${slugify(fields.brand)}`,
    intent_name: fields.intentName,
    buyer_stage: fields.buyerStage,
    intent_category: fields.intentCategory,
    ...(fields.painPoint !== undefined ? { pain_point: fields.painPoint } : {}),
    ...(fields.persona !== undefined ? { persona: fields.persona } : {}),
    country: fields.country,
    language: fields.language,
    prompts: fields.prompts,
    ...(fields.recommendedContent !== undefined
      ? { recommended_content: fields.recommendedContent }
      : {}),
    ...(fields.recommendedCta !== undefined ? { recommended_cta: fields.recommendedCta } : {}),
    sku_ids: fields.skuIds,
    evidence_urls: fields.evidenceUrls,
    ...IMPORTED_RECORD_DEFAULTS,
    measurement_source: fields.measurementSource,
    visibility_pct: fields.visibilityPct,
    monthly_search_volume: fields.monthlySearchVolume,
  };
  const parsed = IntentRecordSchema.safeParse(record);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue !== undefined ? issue.path.map(String).join(".") : "unknown field";
    const why = issue !== undefined ? issue.message : parsed.error.message;
    throw new Error(`generated record failed schema validation at "${where}": ${why}`);
  }
  return parsed.data;
}

/** Merges two rows for the same intent: unions prompts, SKUs, and evidence. */
function mergeFields(base: RowFields, incoming: RowFields): RowFields {
  const union = (a: string[], b: string[]): string[] =>
    [...new Set([...a, ...b])].sort((x, y) => x.localeCompare(y));
  return {
    ...base,
    prompts: union(base.prompts, incoming.prompts),
    skuIds: union(base.skuIds, incoming.skuIds),
    evidenceUrls: union(base.evidenceUrls, incoming.evidenceUrls),
  };
}

/** Counts input rows that carry a non-empty value in the given column. */
function countRowsWithColumn(rows: readonly SolixRow[], column: string): number {
  return rows.filter((row) => {
    const value = row[column];
    return value !== undefined && value.trim() !== "";
  }).length;
}

/**
 * Imports Solix rows into Intent Schema v1. Rows that fail normalization or
 * schema validation are reported and never stored; every column present in
 * the input that produces no record field appears in the report.
 */
export function importSolixRows(
  rows: readonly SolixRow[],
  options: ImportOptions = {},
): ImportResult {
  const failedRows: RowError[] = [];
  const byIntent = new Map<string, RowFields>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    try {
      const fields = normalizeRow(row, options);
      const key = `${fields.brand}\u0000${fields.intentName.toLowerCase()}`;
      const existing = byIntent.get(key);
      byIntent.set(key, existing === undefined ? fields : mergeFields(existing, fields));
    } catch (error) {
      const fieldError = error instanceof FieldError ? error : undefined;
      failedRows.push({
        row: rowNumber,
        field: fieldError?.field,
        reason: fieldError?.message ?? (error instanceof Error ? error.message : String(error)),
      });
    }
  }

  const records: IntentRecord[] = [];
  for (const fields of byIntent.values()) {
    try {
      records.push(toIntentRecord(fields));
    } catch (error) {
      failedRows.push({
        row: 0,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const knownColumns = new Set(
    SOLIX_FIELD_MAP.map((mapping) => resolveColumnName(mapping.solixField, options)),
  );
  const inputColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  const unmappedColumns: DroppedColumn[] = SOLIX_FIELD_MAP.filter(
    (mapping) => mapping.target === null,
  )
    .map((mapping) => {
      const columnName = resolveColumnName(mapping.solixField, options);
      const rowCount = countRowsWithColumn(rows, columnName);
      return { mapping, rowCount };
    })
    .filter(({ rowCount }) => rowCount > 0)
    .map(({ mapping, rowCount }) => ({
      column: mapping.solixField,
      rowCount,
      reason: mapping.note,
    }));

  // Columns the mapping table has never heard of are reported too — a new
  // Solix export column must never pass through invisibly.
  for (const column of inputColumns) {
    if (knownColumns.has(column)) {
      continue;
    }
    unmappedColumns.push({
      column,
      rowCount: countRowsWithColumn(rows, column),
      reason: "unknown column: not in SOLIX_FIELD_MAP; add a columnAliases entry or extend the mapping table in a dedicated change",
    });
  }

  return {
    records,
    report: {
      rowCount: rows.length,
      imported: records.length,
      failedRows,
      unmappedColumns,
    },
  };
}
