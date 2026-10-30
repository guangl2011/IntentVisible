import type { SchemaObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsDefault from "ajv-formats";
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  IntentRecordSchema,
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_MAJOR,
  isSchemaVersionCompatible,
  parseSchemaVersion,
  type IntentRecord,
} from "../src/index.js";
import {
  cloneFixture,
  exampleBrandProfile,
  exampleProductProfile,
  exampleSkuIntentMapping,
  mutatedFixture,
  specExampleIntentRecord,
  withoutKeys,
} from "../src/fixtures.js";

import { ensureParsed, isRejected } from "./helpers.js";

// ajv-formats ships a CJS module with an ESM-style declaration; under
// nodenext the default binding's type resolves to the module namespace,
// so pin the call signature we rely on.
type AddFormats = (ajv: Ajv2020) => void;
const addFormats = addFormatsDefault as unknown as AddFormats;

const SCHEMA_FILES = [
  "brand-profile.schema.json",
  "intent-record.schema.json",
  "product-profile.schema.json",
  "sku-intent-mapping.schema.json",
] as const;

function loadSchema(file: string): SchemaObject {
  const raw = readFileSync(new URL(`../schemas/${file}`, import.meta.url), "utf8");
  return JSON.parse(raw) as SchemaObject;
}

function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

describe("spec section 4.1 example fixture (round-trip)", () => {
  it("parses as a valid IntentRecord", () => {
    const record = ensureParsed(IntentRecordSchema, specExampleIntentRecord);
    expect(record.intent_id).toBe("int_camping_fridge_runtime");
    expect(record.buyer_stage).toBe("Solution Research");
    expect(record.measurement_status).toBe("not_measured");
  });

  it("round-trips through JSON without losing validation", () => {
    const serialized = JSON.parse(JSON.stringify(specExampleIntentRecord)) as unknown;
    expect(IntentRecordSchema.safeParse(serialized).success).toBe(true);
  });

  it("produces a value mutually assignable with the generated contract type", () => {
    const record = ensureParsed(IntentRecordSchema, specExampleIntentRecord);
    expectTypeOf(record).toExtend<IntentRecord>();
    expectTypeOf<IntentRecord>().toExtend<typeof record>();
  });
});

describe("required fields and primitive constraints", () => {
  it("requires schema_version", () => {
    expect(
      isRejected(IntentRecordSchema, withoutKeys(specExampleIntentRecord, "schema_version")),
    ).toBe(true);
  });

  it("requires intent_version >= 1", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { intent_version: 0 }),
      ),
    ).toBe(true);
  });

  it("rejects a malformed intent_id", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { intent_id: "camping fridge" }),
      ),
    ).toBe(true);
  });

  it("rejects an empty prompts array", () => {
    expect(
      isRejected(IntentRecordSchema, mutatedFixture(specExampleIntentRecord, { prompts: [] })),
    ).toBe(true);
  });

  it("rejects evidence_urls outside http(s)", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { evidence_urls: ["ftp://example.com/page"] }),
      ),
    ).toBe(true);
  });

  it("rejects visibility_pct above 100", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { visibility_pct: 150 }),
      ),
    ).toBe(true);
  });

  it("rejects unknown extra keys (strict objects)", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { brand_name: "Example Co" }),
      ),
    ).toBe(true);
  });
});

describe("schema versioning (SemVer discipline)", () => {
  it("exposes the current published version", () => {
    expect(SCHEMA_VERSION).toBe("1.0.0");
    expect(SUPPORTED_SCHEMA_MAJOR).toBe(1);
  });

  it("accepts compatible 1.x versions and rejects 2.x", () => {
    expect(isSchemaVersionCompatible("1.0.0")).toBe(true);
    expect(isSchemaVersionCompatible("1.2.3")).toBe(true);
    expect(isSchemaVersionCompatible("2.0.0")).toBe(false);
    expect(isSchemaVersionCompatible("not-semver")).toBe(false);
    expect(parseSchemaVersion("1.0")).toBeNull();
  });

  it("publishes schemas pinned to major version 1", () => {
    for (const file of SCHEMA_FILES) {
      const schema = loadSchema(file);
      const defs = schema.$defs as Record<string, { pattern?: string }>;
      expect(defs.SchemaVersion?.pattern, `${file} SchemaVersion pattern`).toContain("^1\\.");
    }
  });
});

describe("published JSON Schemas (Ajv draft 2020-12)", () => {
  const ajv = makeAjv();
  const validateIntent = ajv.compile(loadSchema("intent-record.schema.json"));
  const validateBrand = ajv.compile(loadSchema("brand-profile.schema.json"));
  const validateProduct = ajv.compile(loadSchema("product-profile.schema.json"));
  const validateMapping = ajv.compile(loadSchema("sku-intent-mapping.schema.json"));

  it("accepts all example fixtures", () => {
    expect(validateIntent(specExampleIntentRecord)).toBe(true);
    expect(validateBrand(exampleBrandProfile)).toBe(true);
    expect(validateProduct(exampleProductProfile)).toBe(true);
    expect(validateMapping(exampleSkuIntentMapping)).toBe(true);
  });

  it("rejects a major-version-2 schema_version", () => {
    const broken = mutatedFixture(specExampleIntentRecord, { schema_version: "2.0.0" });
    expect(validateIntent(broken)).toBe(false);
  });

  it("keeps Ajv in agreement with Zod on the null-measurement rule", () => {
    const violating = mutatedFixture(specExampleIntentRecord, { visibility_pct: 55 });
    expect(validateIntent(violating)).toBe(false);
    expect(isRejected(IntentRecordSchema, violating)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod on the http(s)-only URL rule", () => {
    const ftpEvidence = mutatedFixture(specExampleIntentRecord, {
      evidence_urls: ["ftp://example.com/products/example"],
    });
    expect(validateIntent(ftpEvidence)).toBe(false);
    expect(isRejected(IntentRecordSchema, ftpEvidence)).toBe(true);
  });
});

describe("schema self-containment", () => {
  it("keeps duplicated shared defs identical across files", () => {
    const defsByName = new Map<string, Array<{ file: string; def: unknown }>>();
    for (const file of SCHEMA_FILES) {
      const schema = loadSchema(file);
      const defs = schema.$defs as Record<string, unknown>;
      for (const [name, def] of Object.entries(defs)) {
        const seen = defsByName.get(name) ?? [];
        seen.push({ file, def });
        defsByName.set(name, seen);
      }
    }
    for (const [name, seen] of defsByName) {
      const first = seen[0];
      if (!first) {
        throw new Error(`No schema files recorded a definition for $defs/${name}`);
      }
      const canonical = JSON.stringify(first.def);
      for (const entry of seen.slice(1)) {
        expect(
          JSON.stringify(entry.def),
          `${entry.file} $defs/${name} drifted from ${first.file}`,
        ).toBe(canonical);
      }
    }
  });
});

describe("fixtures", () => {
  it("cloneFixture returns an independent copy", () => {
    const clone = cloneFixture(specExampleIntentRecord);
    clone.intent_name = "Changed";
    expect(specExampleIntentRecord.intent_name).toBe("Camping Fridge Runtime");
  });
});
