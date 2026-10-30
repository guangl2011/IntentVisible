import type { SchemaObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsDefault from "ajv-formats";
import { IntentRecordSchema } from "@intentvisible/core-schema";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SOLIX_FIELDS,
  importSolixCsv,
  importSolixJson,
  importSolixRows,
  SOLIX_FIELD_MAP,
  IMPORTED_RECORD_DEFAULTS,
  slugify,
  type SolixRow,
} from "../src/index.js";

// ajv-formats ships a CJS module with an ESM-style declaration; under
// NodeNext the default import needs this cast (same pattern as core-schema).
type AddFormats = (ajv: Ajv2020) => void;
const addFormats = addFormatsDefault as unknown as AddFormats;

function loadSchema(name: string): SchemaObject {
  return JSON.parse(
    readFileSync(new URL(`../../core-schema/schemas/${name}`, import.meta.url), "utf8"),
  ) as SchemaObject;
}

function makeAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function loadFixture(name: string): string {
  return readFileSync(new URL(`../fixture/${name}`, import.meta.url), "utf8");
}

const csvFixture = () => importSolixCsv(loadFixture("solix-sample.csv"));

describe("solix golden dataset import", () => {
  it("imports every fixture row, merging paraphrase rows of the same intent", () => {
    const { records, report } = csvFixture();
    expect(report.rowCount).toBe(5);
    expect(report.failedRows).toEqual([]);
    // Rows 1 and 5 share brand + intent name → one merged record.
    expect(records).toHaveLength(4);

    const merged = records.find((record) => record.intent_id === "int_s2000_vs_rivals");
    expect(merged?.prompts).toEqual([
      "How does the Solix S2000 compare to EcoFlow and Jackery rivals?",
      "Is the S2000 better than the EcoFlow Delta 2 for overlanding?",
    ]);
    expect(merged?.evidence_urls).toHaveLength(2);
    expect(merged?.sku_ids).toEqual(["sku_s2000_01", "sku_s2000_02"]);
  });

  it("validates every imported record against the published core-schema JSON Schema", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(loadSchema("intent-record.schema.json"));
    const { records } = csvFixture();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(validate(record), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("keeps Zod in agreement with Ajv on the same records", () => {
    const { records } = csvFixture();
    for (const record of records) {
      expect(IntentRecordSchema.safeParse(record).success).toBe(true);
    }
  });

  it("produces identical records from the CSV and JSON fixtures", () => {
    const fromCsv = csvFixture().records;
    const fromJson = importSolixJson(loadFixture("solix-sample.json")).records;
    expect(fromJson).toEqual(fromCsv);
  });

  it("preserves legacy measured values under measurement_status 'imported'", () => {
    const { records } = csvFixture();
    const measured = records.find((record) => record.intent_id === "int_how_long_fridge");
    expect(measured).toMatchObject({
      measurement_status: "imported",
      measurement_source: "Visible GEO panel",
      visibility_pct: 15.2,
      monthly_search_volume: 1220,
      opportunity_type: "hypothesis",
    });
  });

  it("maps measurement-derived fields to standalone nulls when the row has no value", () => {
    const { records } = csvFixture();
    const unmeasured = records.find((record) => record.intent_id === "int_camping_power_rec");
    expect(unmeasured).toMatchObject({
      measurement_status: "imported",
      measurement_source: null,
      visibility_pct: null,
      monthly_search_volume: null,
    });
  });

  it("carries the eleven inherited fields through to every record", () => {
    const { records } = csvFixture();
    for (const record of records) {
      expect(record.intent_name).toBeTruthy();
      expect(record.prompts.length).toBeGreaterThan(0);
      expect(record.buyer_stage).toBeTruthy();
      expect(record.intent_category).toBeTruthy();
      expect(record.country).toMatch(/^[A-Z]{2}$/);
      expect(record.language).toMatch(/^[a-z]{2}$/);
      expect(record.brand_id).toBe("brand_solix");
      expect(record.recommended_content).toBeTruthy();
      expect(record.recommended_cta).toBeTruthy();
      // Persona/pain_point are optional on the record but present in the fixture.
      expect(record.pain_point).toBeTruthy();
      expect(record.persona).toBeTruthy();
    }
  });

  it("reports dropped and unmappable columns with reasons", () => {
    const { report } = csvFixture();
    const columns = report.unmappedColumns.map((entry) => entry.column);
    // Measurement-derived labels with no schema home…
    for (const expected of [
      "Date",
      "Revenue Expansion",
      "Market Expansion",
      "Industry",
      "Competitors",
    ]) {
      expect(columns).toContain(expected);
    }
    // …and every report entry explains itself.
    for (const entry of report.unmappedColumns) {
      expect(entry.reason).toMatch(/\S/);
      expect(entry.rowCount).toBeGreaterThan(0);
    }
  });

  it("reports unknown columns instead of dropping them silently", () => {
    const rows: SolixRow[] = [
      {
        "Intent Name": "New Column Probe",
        Prompt: "Does an unknown column vanish?",
        "Buyer Stage": "Awareness",
        "Intent Category": "Category Question",
        Language: "en",
        Country: "US",
        Brand: "Probe",
        Source: "https://www.example.com/probe",
        "Brand New Column": "mystery value",
      },
    ];
    const { report } = importSolixRows(rows);
    const unknown = report.unmappedColumns.find((entry) => entry.column === "Brand New Column");
    expect(unknown?.reason).toMatch(/unknown column/);
  });

  it("fails rows with typed reasons instead of storing invalid records", () => {
    const base: SolixRow = {
      "Intent Name": "Broken Row Probe",
      Prompt: "Is this row invalid?",
      "Buyer Stage": "Definitely Not A Stage",
      "Intent Category": "Comparison",
      Language: "en",
      Country: "US",
      Brand: "Probe",
      Source: "https://www.example.com/probe",
    };
    const badStage = importSolixRows([base]);
    expect(badStage.records).toHaveLength(0);
    expect(badStage.report.failedRows[0]).toMatchObject({
      row: 1,
      field: "Buyer Stage",
    });

    const noEvidence = importSolixRows([{ ...base, "Buyer Stage": "Awareness", Source: "not a url" }]);
    expect(noEvidence.report.failedRows[0]).toMatchObject({ field: "Source" });

    const badCountry = importSolixRows([{ ...base, "Buyer Stage": "Awareness", Country: "USA" }]);
    expect(badCountry.report.failedRows[0]).toMatchObject({ field: "Country" });
  });

  it("accepts a real export's headers as a config change (columnAliases)", () => {
    const rows: SolixRow[] = [
      {
        intent_title: "Alias Probe",
        buyer_prompt: "Does the alias config work?",
        stage: "Awareness",
        category: "Price",
        locale_lang: "en",
        market: "US",
        vendor: "Probe",
        page_link: "https://www.example.com/probe",
      },
    ];
    const { records, report } = importSolixRows(rows, {
      columnAliases: {
        "Intent Name": "intent_title",
        Prompt: "buyer_prompt",
        "Buyer Stage": "stage",
        "Intent Category": "category",
        Language: "locale_lang",
        Country: "market",
        Brand: "vendor",
        Source: "page_link",
      },
    });
    expect(report.failedRows).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      intent_id: "int_alias_probe",
      brand_id: "brand_probe",
      country: "US",
    });
  });

  it("derives stable intent ids from intent names", () => {
    expect(slugify("S2000 vs Rivals")).toBe("s2000_vs_rivals");
    expect(slugify("How Long Fridge?")).toBe("how_long_fridge");
  });
});

describe("field-mapping table (plan section 2.1)", () => {
  const elevenInheritedTargets = [
    "intent_name",
    "prompts",
    "buyer_stage",
    "intent_category",
    "pain_point",
    "persona",
    "language",
    "country",
    "brand_id",
    "recommended_content",
    "recommended_cta",
  ];

  it("maps all eleven inherited fields, none silently dropped", () => {
    const inherited = SOLIX_FIELD_MAP.filter((mapping) => mapping.kind === "inherited");
    expect(inherited).toHaveLength(11);
    expect(inherited.map((mapping) => mapping.target).sort()).toEqual(
      [...elevenInheritedTargets].sort(),
    );
    for (const mapping of inherited) {
      expect(mapping.target, `${mapping.solixField} must have a schema home`).not.toBeNull();
    }
  });

  it("covers every measurement-derived field named by plan section 2.1", () => {
    const mapped = new Map(SOLIX_FIELD_MAP.map((mapping) => [mapping.solixField, mapping]));
    const measurementDerived = SOLIX_FIELDS.filter(
      (field) => mapped.get(field)?.kind === "measurement-derived",
    );
    expect(measurementDerived).toEqual(
      expect.arrayContaining([
        "Visibility (%)",
        "Source Models",
        "Date",
        "Monthly Search Volume",
        "Revenue Expansion",
        "Market Expansion",
        "Source",
      ]),
    );
  });

  it("substitutes opportunity_type 'hypothesis' for the expansion labels", () => {
    expect(IMPORTED_RECORD_DEFAULTS.opportunity_type).toBe("hypothesis");
    const { records } = csvFixture();
    for (const record of records) {
      expect(record.opportunity_type).toBe("hypothesis");
    }
  });

  it("declares every canonical Solix field exactly once", () => {
    const fields = SOLIX_FIELD_MAP.map((mapping) => mapping.solixField);
    expect(new Set(fields).size).toBe(fields.length);
    expect(new Set(SOLIX_FIELDS)).toEqual(new Set(fields));
  });
});
