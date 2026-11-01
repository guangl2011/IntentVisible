import { describe, expect, it } from "vitest";

import {
  IntentRecordV2Schema,
  MarketingGraphSchema,
  MetricsSnapshotSchema,
  MonitoringRunSchema,
  PersonaRecordSchema,
  PromptRecordSchema,
  ScenarioRecordSchema,
} from "./index.js";
import {
  cloneFixture,
  exampleIntentRecordV2,
  exampleIntentTopic,
  exampleMarketingGraph,
  exampleMetricsSnapshot,
  exampleMonitoringRun,
  examplePersona,
  examplePromptRecord,
  exampleScenario,
  V2_TIMESTAMP,
} from "./fixtures-v2.js";

import { ensureParsed, isRejected, issuePaths } from "../tests/helpers.js";

/**
 * Zod-side v2 record validation (blueprint Stage A/B/C field shapes).
 * Rules expressible in JSON Schema too are parity-checked in
 * tests/parity-v2.test.ts; cross-record invariants (referential integrity,
 * id uniqueness, no self-competitor) only exist here.
 */
describe("PersonaRecordSchema", () => {
  it("parses the example persona", () => {
    const persona = ensureParsed(PersonaRecordSchema, examplePersona);
    expect(persona.persona_id).toBe("persona_weekend_camper");
    expect(persona.archetype).toBe("Weekend Camper");
  });

  it("requires provenance on generated records (data-mode integrity)", () => {
    expect(
      isRejected(PersonaRecordSchema, { ...cloneFixture(examplePersona), provenance: undefined }),
    ).toBe(true);
    expect(
      isRejected(PersonaRecordSchema, {
        ...cloneFixture(examplePersona),
        provenance: { source: "gemini-2.5-pro" },
      }),
    ).toBe(true);
  });

  it("requires data_mode", () => {
    expect(
      isRejected(PersonaRecordSchema, { ...cloneFixture(examplePersona), data_mode: undefined }),
    ).toBe(true);
  });

  it("rejects a non-assumption trait with no evidence (evidence integrity)", () => {
    const broken = cloneFixture(examplePersona);
    (broken.core_frustrations as Array<Record<string, unknown>>)[0]!.evidence_urls = [];
    expect(isRejected(PersonaRecordSchema, broken)).toBe(true);
  });

  it("rejects unknown extra keys (strict objects)", () => {
    expect(isRejected(PersonaRecordSchema, { ...cloneFixture(examplePersona), title: "Dr" })).toBe(
      true,
    );
  });
});

describe("ScenarioRecordSchema", () => {
  it("parses the example scenario", () => {
    const scenario = ensureParsed(ScenarioRecordSchema, exampleScenario);
    expect(scenario.scenario_type).toBe("daily_pain");
  });

  it("rejects an unknown scenario type", () => {
    expect(
      isRejected(ScenarioRecordSchema, {
        ...cloneFixture(exampleScenario),
        scenario_type: "final_compare",
      }),
    ).toBe(true);
  });
});

describe("PromptRecordSchema", () => {
  it("parses the example prompt", () => {
    const prompt = ensureParsed(PromptRecordSchema, examplePromptRecord);
    expect(prompt.buyer_stage).toBe("Solution Research");
    expect(prompt.intent_category).toBe("Technical");
  });

  it("rejects legacy v1 enum values (Consideration is not a v2 stage)", () => {
    expect(
      isRejected(PromptRecordSchema, {
        ...cloneFixture(examplePromptRecord),
        buyer_stage: "Consideration",
      }),
    ).toBe(true);
  });

  it("enforces the prompt text bounds (the buyer's actual phrasing)", () => {
    expect(
      isRejected(PromptRecordSchema, { ...cloneFixture(examplePromptRecord), text: "too short" }),
    ).toBe(true);
    expect(
      isRejected(PromptRecordSchema, {
        ...cloneFixture(examplePromptRecord),
        text: `x${"x".repeat(1000)}`,
      }),
    ).toBe(true);
  });

  it("caps monitored competitors at 10", () => {
    expect(
      isRejected(PromptRecordSchema, {
        ...cloneFixture(examplePromptRecord),
        competitors: Array.from({ length: 11 }, (_, i) => `brand_rival_${i}`),
      }),
    ).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(
      isRejected(PromptRecordSchema, { ...cloneFixture(examplePromptRecord), status: "approved" }),
    ).toBe(true);
  });
});

describe("MonitoringRunSchema", () => {
  it("parses the example run", () => {
    const run = ensureParsed(MonitoringRunSchema, exampleMonitoringRun);
    expect(run.platform).toBe("perplexity");
    expect(run.round).toBe(1);
  });

  it("rejects llm_estimated as a run data mode — estimates never describe answers", () => {
    expect(
      isRejected(MonitoringRunSchema, {
        ...cloneFixture(exampleMonitoringRun),
        data_mode: "llm_estimated",
      }),
    ).toBe(true);
  });

  it("accepts provider_measured for the advanced tier", () => {
    const measured = { ...cloneFixture(exampleMonitoringRun), data_mode: "provider_measured" };
    expect(isRejected(MonitoringRunSchema, measured)).toBe(false);
  });

  it("requires the raw-answer snapshot hash", () => {
    expect(
      isRejected(MonitoringRunSchema, {
        ...cloneFixture(exampleMonitoringRun),
        raw_answer_content_hash: undefined,
      }),
    ).toBe(true);
  });

  it("rejects baseline round 0", () => {
    expect(
      isRejected(MonitoringRunSchema, { ...cloneFixture(exampleMonitoringRun), round: 0 }),
    ).toBe(true);
  });

  it("rejects non-http(s) citations", () => {
    expect(
      isRejected(MonitoringRunSchema, {
        ...cloneFixture(exampleMonitoringRun),
        citations: ["ftp://example.com/page"],
      }),
    ).toBe(true);
  });
});

describe("MetricsSnapshotSchema", () => {
  it("parses the example snapshot", () => {
    const snapshot = ensureParsed(MetricsSnapshotSchema, exampleMetricsSnapshot);
    expect(snapshot.visibility_pct).toBe(42.5);
    expect(snapshot.consensus).toBe("stable");
  });

  it("rejects a metric without its provenance block", () => {
    expect(
      isRejected(MetricsSnapshotSchema, {
        ...cloneFixture(exampleMetricsSnapshot),
        provenance: undefined,
      }),
    ).toBe(true);
    expect(
      isRejected(MetricsSnapshotSchema, {
        ...cloneFixture(exampleMetricsSnapshot),
        data_mode: undefined,
      }),
    ).toBe(true);
  });

  it("keeps leader and gap set-or-null together", () => {
    const orphanGap = { ...cloneFixture(exampleMetricsSnapshot), top_competitor_id: null };
    expect(isRejected(MetricsSnapshotSchema, orphanGap)).toBe(true);
    const paths = issuePaths(MetricsSnapshotSchema, orphanGap);
    expect(paths).toContain("leader_gap_pct");
  });

  it("rejects an inverted date range", () => {
    expect(
      isRejected(MetricsSnapshotSchema, {
        ...cloneFixture(exampleMetricsSnapshot),
        date_range: { from: "2026-10-31T00:00:00Z", to: "2026-10-30T00:00:00Z" },
      }),
    ).toBe(true);
  });

  it("keeps void_rate within 0-100 (the >=25 tag is derived downstream)", () => {
    expect(
      isRejected(MetricsSnapshotSchema, {
        ...cloneFixture(exampleMetricsSnapshot),
        void_rate_pct: 100.1,
      }),
    ).toBe(true);
  });
});

describe("MarketingGraphSchema", () => {
  it("parses the example graph (Gate 1 artifact)", () => {
    const graph = ensureParsed(MarketingGraphSchema, exampleMarketingGraph);
    expect(graph.graph_version).toBe(1);
    expect(graph.intent_topics).toHaveLength(2);
  });

  it("rejects a scenario edge referencing an unknown persona", () => {
    const broken = cloneFixture(exampleMarketingGraph);
    (broken.scenarios as Array<Record<string, unknown>>)[0]!.persona_id = "persona_ghost";
    const paths = issuePaths(MarketingGraphSchema, broken);
    expect(paths).toContain("scenarios.0.persona_id");
  });

  it("rejects duplicate ids in any node collection", () => {
    const duplicateIntent = cloneFixture(exampleMarketingGraph);
    (duplicateIntent.intent_topics as Array<Record<string, unknown>>)[1]!.intent_id =
      "int_camping_fridge_runtime";
    expect(issuePaths(MarketingGraphSchema, duplicateIntent)).toContain("intent_topics");

    const duplicatePersona = cloneFixture(exampleMarketingGraph);
    (duplicatePersona.personas as Array<Record<string, unknown>>)[1]!.persona_id =
      "persona_weekend_camper";
    expect(issuePaths(MarketingGraphSchema, duplicatePersona)).toContain("personas");

    const duplicateCompetitor = cloneFixture(exampleMarketingGraph);
    (duplicateCompetitor.competitors as Array<Record<string, unknown>>)[1]!.brand_id =
      "brand_ecoflow";
    expect(issuePaths(MarketingGraphSchema, duplicateCompetitor)).toContain("competitors");
  });

  it("never lets the brand compete with itself", () => {
    const selfRival = cloneFixture(exampleMarketingGraph);
    (selfRival.competitors as Array<Record<string, unknown>>)[0]!.brand_id = "brand_solix";
    expect(issuePaths(MarketingGraphSchema, selfRival)).toContain("competitors.0.brand_id");
  });

  it("requires a low fit score to name its mismatch (Stage A.4)", () => {
    const graph = cloneFixture(exampleMarketingGraph);
    const lowFitWithoutReason = {
      ...exampleIntentTopic,
      intent_id: "int_other",
      fit: {
        score: 0.4,
        data_mode: "llm_estimated",
        provenance: { source: "gemini-2.5-pro", retrieved_at: "2026-11-01T00:00:00Z" },
      },
    };
    (graph.intent_topics as Array<Record<string, unknown>>)[1] = lowFitWithoutReason;
    expect(issuePaths(MarketingGraphSchema, graph)).toContain(
      "intent_topics.1.fit.mismatch_reason",
    );
  });

  it("accepts a fit score of exactly 0.5 without a mismatch reason", () => {
    const graph = cloneFixture(exampleMarketingGraph);
    const boundary = {
      ...exampleIntentTopic,
      intent_id: "int_other",
      fit: {
        score: 0.5,
        data_mode: "llm_estimated",
        provenance: { source: "gemini-2.5-pro", retrieved_at: "2026-11-01T00:00:00Z" },
      },
    };
    (graph.intent_topics as Array<Record<string, unknown>>)[1] = boundary;
    expect(isRejected(MarketingGraphSchema, graph)).toBe(false);
  });

  it("never lets an LLM-estimated demand tier carry a volume number", () => {
    const graph = cloneFixture(exampleMarketingGraph);
    (graph.intent_topics as Array<Record<string, unknown>>)[0]!.volume = {
      ...(exampleIntentTopic.volume as Record<string, unknown>),
      monthly_volume: 840,
    };
    expect(issuePaths(MarketingGraphSchema, graph)).toContain(
      "intent_topics.0.volume.monthly_volume",
    );
  });

  it("accepts a volume number only under provider_measured", () => {
    const graph = cloneFixture(exampleMarketingGraph);
    (graph.intent_topics as Array<Record<string, unknown>>)[0]!.volume = {
      ...(exampleIntentTopic.volume as Record<string, unknown>),
      monthly_volume: 840,
      data_mode: "provider_measured",
      provenance: { source: "dataforseo", retrieved_at: "2026-11-01T00:00:00Z" },
    };
    expect(isRejected(MarketingGraphSchema, graph)).toBe(false);
  });
});

describe("IntentRecordV2Schema", () => {
  it("parses the published example record (simulated with full provenance)", () => {
    const record = ensureParsed(IntentRecordV2Schema, exampleIntentRecordV2);
    expect(record.measurement_status).toBe("simulated");
    expect(record.measurement_provenance?.model_id).toBe("gemini-2.5-pro");
    expect(record.measurement_provenance?.date_range.from).toBe(V2_TIMESTAMP);
  });

  it("rejects legacy v1 enum values (Consideration is not a v2 stage)", () => {
    expect(
      isRejected(IntentRecordV2Schema, {
        ...cloneFixture(exampleIntentRecordV2),
        buyer_stage: "Consideration",
      }),
    ).toBe(true);
  });

  it("rejects a simulated record without measurement provenance (a number without its origin)", () => {
    const noProvenance = cloneFixture(exampleIntentRecordV2);
    delete noProvenance.measurement_provenance;
    expect(isRejected(IntentRecordV2Schema, noProvenance)).toBe(true);
  });

  it("rejects a simulated record with null visibility or null source", () => {
    expect(
      isRejected(IntentRecordV2Schema, {
        ...cloneFixture(exampleIntentRecordV2),
        visibility_pct: null,
      }),
    ).toBe(true);
    expect(
      isRejected(IntentRecordV2Schema, {
        ...cloneFixture(exampleIntentRecordV2),
        measurement_source: null,
      }),
    ).toBe(true);
  });

  it("accepts a not_measured draft only with null measurement fields and no provenance", () => {
    const draft = {
      ...cloneFixture(exampleIntentRecordV2),
      intent_version: 1,
      measurement_status: "not_measured",
      measurement_source: null,
      measurement_provenance: undefined,
      visibility_pct: null,
    };
    expect(isRejected(IntentRecordV2Schema, draft)).toBe(false);
    expect(isRejected(IntentRecordV2Schema, { ...draft, visibility_pct: 12 })).toBe(true);
    expect(
      isRejected(IntentRecordV2Schema, {
        ...draft,
        measurement_provenance: {
          source: "x",
          model_id: "y",
          date_range: { from: V2_TIMESTAMP, to: V2_TIMESTAMP },
        },
      }),
    ).toBe(true);
  });

  it("accepts provider_measured for the advanced tier", () => {
    const measured = {
      ...cloneFixture(exampleIntentRecordV2),
      measurement_status: "measured",
      measurement_source: "dataforseo",
      measurement_provenance: {
        source: "dataforseo",
        model_id: "dataforseo",
        date_range: { from: V2_TIMESTAMP, to: V2_TIMESTAMP },
      },
    };
    expect(isRejected(IntentRecordV2Schema, measured)).toBe(false);
  });

  it("rejects an inverted provenance date range", () => {
    const inverted = cloneFixture(exampleIntentRecordV2);
    (inverted.measurement_provenance as Record<string, unknown>).date_range = {
      from: "2026-11-02T00:00:00Z",
      to: "2026-11-01T00:00:00Z",
    };
    expect(isRejected(IntentRecordV2Schema, inverted)).toBe(true);
  });

  it("rejects unknown extra keys (strict objects)", () => {
    expect(
      isRejected(IntentRecordV2Schema, { ...cloneFixture(exampleIntentRecordV2), title: "Dr" }),
    ).toBe(true);
  });
});
