import type { SchemaObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsDefault from "ajv-formats";
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  IntentRecordV2Schema,
  MarketingGraphSchema,
  MetricsSnapshotSchema,
  MonitoringRunSchema,
  PersonaRecordSchema,
  PromptRecordSchema,
  ScenarioRecordSchema,
  SCHEMA_VERSION_V2,
  SUPPORTED_SCHEMA_MAJOR_V2,
  type IntentRecordV2,
  type MarketingGraph,
  type MetricsSnapshot,
  type MonitoringRun,
  type Persona,
  type PromptRecord,
  type Scenario,
} from "../src/index.js";
import {
  exampleIntentRecordV2,
  exampleMarketingGraph,
  exampleMetricsSnapshot,
  exampleMonitoringRun,
  examplePersona,
  examplePromptRecord,
  exampleScenario,
} from "../src/fixtures-v2.js";

import { ensureParsed, isRejected } from "./helpers.js";

// ajv-formats ships a CJS module with an ESM-style declaration; under
// nodenext the default binding's type resolves to the module namespace,
// so pin the call signature we rely on. (Same shim as contract.test.ts.)
type AddFormats = (ajv: Ajv2020) => void;
const addFormats = addFormatsDefault as unknown as AddFormats;

const V2_SCHEMA_FILES = [
  "intent-record-v2.schema.json",
  "marketing-graph.schema.json",
  "metrics-snapshot.schema.json",
  "monitoring-run.schema.json",
  "persona.schema.json",
  "prompt-record.schema.json",
  "scenario.schema.json",
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

/** Deep-clone helper for fixture records (plain JSON shapes). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Narrow slice of the graph fixture that mutation tests touch. */
interface GraphFixture {
  intent_topics: Array<{
    fit: { score: number };
    volume: { monthly_volume: number | null };
  }>;
}

/**
 * Ajv/Zod parity for the six pipeline-v2 schemas: the published JSON Schema
 * files (non-TS consumers) and the Zod modules (TS runtime) must agree on
 * every rule expressible in both. Cross-record invariants (graph
 * referential integrity, id uniqueness) are Zod-only — JSON Schema cannot
 * express them, and those cases are covered in src/schemas-v2.test.ts.
 */
describe("v2 published JSON Schemas (Ajv draft 2020-12)", () => {
  const ajv = makeAjv();
  const validatePersona = ajv.compile(loadSchema("persona.schema.json"));
  const validateScenario = ajv.compile(loadSchema("scenario.schema.json"));
  const validatePrompt = ajv.compile(loadSchema("prompt-record.schema.json"));
  const validateRun = ajv.compile(loadSchema("monitoring-run.schema.json"));
  const validateMetrics = ajv.compile(loadSchema("metrics-snapshot.schema.json"));
  const validateGraph = ajv.compile(loadSchema("marketing-graph.schema.json"));
  const validateIntentRecordV2 = ajv.compile(loadSchema("intent-record-v2.schema.json"));

  it("accepts all v2 example fixtures", () => {
    expect(validatePersona(examplePersona)).toBe(true);
    expect(validateScenario(exampleScenario)).toBe(true);
    expect(validatePrompt(examplePromptRecord)).toBe(true);
    expect(validateRun(exampleMonitoringRun)).toBe(true);
    expect(validateMetrics(exampleMetricsSnapshot)).toBe(true);
    expect(validateGraph(exampleMarketingGraph)).toBe(true);
    expect(validateIntentRecordV2(exampleIntentRecordV2)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod: a trait must cite evidence or flag an assumption", () => {
    const uncited = clone(examplePersona);
    (uncited.core_frustrations as Array<Record<string, unknown>>)[0]!.evidence_urls = [];
    expect(validatePersona(uncited)).toBe(false);
    expect(isRejected(PersonaRecordSchema, uncited)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod: v1 enum values are rejected in v2 records", () => {
    const legacyStage = { ...clone(examplePromptRecord), buyer_stage: "Consideration" };
    expect(validatePrompt(legacyStage)).toBe(false);
    expect(isRejected(PromptRecordSchema, legacyStage)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod: runs never carry the llm_estimated mode", () => {
    const estimatedRun = { ...clone(exampleMonitoringRun), data_mode: "llm_estimated" };
    expect(validateRun(estimatedRun)).toBe(false);
    expect(isRejected(MonitoringRunSchema, estimatedRun)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod: a fit score below 0.5 must name its mismatch", () => {
    const graph = clone(exampleMarketingGraph) as unknown as GraphFixture;
    graph.intent_topics[0]!.fit.score = 0.4; // fixture fit carries no mismatch_reason
    expect(validateGraph(graph)).toBe(false);
    expect(isRejected(MarketingGraphSchema, graph)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod: volume numbers only exist under provider_measured", () => {
    const graph = clone(exampleMarketingGraph) as unknown as GraphFixture;
    graph.intent_topics[0]!.volume.monthly_volume = 840;
    expect(validateGraph(graph)).toBe(false);
    expect(isRejected(MarketingGraphSchema, graph)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod: a not_measured record never carries measurement provenance", () => {
    const draft = clone(exampleIntentRecordV2) as Record<string, unknown>;
    draft.measurement_status = "not_measured";
    draft.measurement_source = null;
    draft.visibility_pct = null;
    delete draft.measurement_provenance;
    expect(validateIntentRecordV2(draft)).toBe(true);
    draft.measurement_provenance = {
      source: "gemini-2.5-pro",
      model_id: "gemini-2.5-pro",
      date_range: { from: "2026-11-01T00:00:00Z", to: "2026-11-01T00:00:00Z" },
    };
    expect(validateIntentRecordV2(draft)).toBe(false);
    expect(isRejected(IntentRecordV2Schema, draft)).toBe(true);
  });

  it("keeps Ajv in agreement with Zod: a simulated record without provenance is rejected", () => {
    const unpublished = clone(exampleIntentRecordV2) as Record<string, unknown>;
    delete unpublished.measurement_provenance;
    expect(validateIntentRecordV2(unpublished)).toBe(false);
    expect(isRejected(IntentRecordV2Schema, unpublished)).toBe(true);
  });
});

describe("v2 generated types (type-drift check)", () => {
  it("keeps parsed Zod output mutually assignable with the generated contract types", () => {
    const persona = ensureParsed(PersonaRecordSchema, examplePersona);
    expectTypeOf(persona).toExtend<Persona>();
    expectTypeOf<Persona>().toExtend<typeof persona>();

    const scenario = ensureParsed(ScenarioRecordSchema, exampleScenario);
    expectTypeOf(scenario).toExtend<Scenario>();
    expectTypeOf<Scenario>().toExtend<typeof scenario>();

    const prompt = ensureParsed(PromptRecordSchema, examplePromptRecord);
    expectTypeOf(prompt).toExtend<PromptRecord>();
    expectTypeOf<PromptRecord>().toExtend<typeof prompt>();

    const run = ensureParsed(MonitoringRunSchema, exampleMonitoringRun);
    expectTypeOf(run).toExtend<MonitoringRun>();
    expectTypeOf<MonitoringRun>().toExtend<typeof run>();

    const metrics = ensureParsed(MetricsSnapshotSchema, exampleMetricsSnapshot);
    expectTypeOf(metrics).toExtend<MetricsSnapshot>();
    expectTypeOf<MetricsSnapshot>().toExtend<typeof metrics>();

    const graph = ensureParsed(MarketingGraphSchema, exampleMarketingGraph);
    expectTypeOf(graph).toExtend<MarketingGraph>();
    expectTypeOf<MarketingGraph>().toExtend<typeof graph>();

    const intentRecord = ensureParsed(IntentRecordV2Schema, exampleIntentRecordV2);
    expectTypeOf(intentRecord).toExtend<IntentRecordV2>();
    expectTypeOf<IntentRecordV2>().toExtend<typeof intentRecord>();
  });
});

describe("v2 schema self-containment", () => {
  it("pins every v2 schema file to major version 2", () => {
    for (const file of V2_SCHEMA_FILES) {
      const schema = loadSchema(file);
      const defs = schema.$defs as Record<string, { pattern?: string }>;
      expect(defs.SchemaVersionV2?.pattern, `${file} SchemaVersionV2 pattern`).toContain("^2\\.");
    }
    expect(SCHEMA_VERSION_V2).toBe("2.0.0");
    expect(SUPPORTED_SCHEMA_MAJOR_V2).toBe(2);
  });

  it("keeps duplicated shared defs identical across the six files", () => {
    const defsByName = new Map<string, Array<{ file: string; def: unknown }>>();
    for (const file of V2_SCHEMA_FILES) {
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
