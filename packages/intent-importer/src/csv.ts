/**
 * Minimal RFC 4180 CSV reader — enough for the Solix golden dataset
 * (quoted fields, "" escapes, CRLF or LF row endings). Kept dependency-free
 * so the importer's only contract is core-schema.
 */

/**
 * Splits CSV text into a grid of raw field strings. The header row is the
 * caller's concern; this only handles quoting and row termination.
 */
export function parseCsvGrid(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    grid.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\r") {
      if (text[i + 1] === "\n") {
        i++;
      }
      pushRow();
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    pushRow();
  }

  // Drop trailing fully-empty rows produced by a final newline.
  for (;;) {
    const last = grid[grid.length - 1];
    if (last === undefined || !last.every((cell) => cell === "")) {
      break;
    }
    grid.pop();
  }
  return grid;
}

/** A parsed CSV row keyed by its header names. */
export type CsvRow = Record<string, string>;

/** Zips the grid's header row with each data row; blank headers fail loudly. */
export function gridToRows(grid: string[][]): CsvRow[] {
  const headerRow = grid[0];
  if (headerRow === undefined) {
    return [];
  }
  const headers = headerRow.map((header, index) => {
    const name = header.trim();
    if (name === "") {
      throw new Error(`CSV header column ${index + 1} is empty`);
    }
    return name;
  });
  return grid.slice(1).map((cells, rowIndex) => {
    const row: CsvRow = {};
    headers.forEach((name, index) => {
      const value = cells[index]?.trim() ?? "";
      if (value !== "") {
        row[name] = value;
      }
    });
    if (Object.keys(row).length === 0) {
      throw new Error(`CSV row ${rowIndex + 2} is empty`);
    }
    return row;
  });
}
