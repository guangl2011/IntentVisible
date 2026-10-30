/**
 * Solix golden dataset importer: maps Solix rows into Intent Schema v1 with
 * measurement-derived fields set to standalone-mode nulls (spec art_KGYzMB5Z).
 */

import { gridToRows, parseCsvGrid } from "./csv.js";
import { importSolixRows, type ImportOptions, type ImportResult, type SolixRow } from "./import.js";

export * from "./field-map.js";
export * from "./import.js";
export { gridToRows, parseCsvGrid } from "./csv.js";
export type { CsvRow } from "./csv.js";

/** Coerces one JSON-row value into a raw cell string (booleans/numbers pass through). */
function cellToString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new Error(`unsupported JSON cell type: ${typeof value}`);
}

/** Normalizes one parsed JSON row into a SolixRow. */
function normalizeJsonRow(raw: unknown, index: number): SolixRow {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`JSON row ${index + 1} is not an object`);
  }
  const row: SolixRow = {};
  for (const [key, value] of Object.entries(raw)) {
    const cell = cellToString(value);
    if (cell !== undefined) {
      row[key] = cell;
    }
  }
  return row;
}

/** Imports Solix CSV text into Intent Schema v1 records plus a validation report. */
export function importSolixCsv(csv: string, options: ImportOptions = {}): ImportResult {
  const rows = gridToRows(parseCsvGrid(csv));
  return importSolixRows(rows, options);
}

/** Imports a Solix JSON array (objects keyed like the CSV headers). */
export function importSolixJson(json: string, options: ImportOptions = {}): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Solix JSON is not parseable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Solix JSON must be an array of row objects");
  }
  const rows: SolixRow[] = parsed.map(normalizeJsonRow);
  return importSolixRows(rows, options);
}
