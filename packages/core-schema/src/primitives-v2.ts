import { z } from "zod";

import { IsoDateTimeSchema, patternSchema, UrlSchema } from "./primitives.js";
import { SCHEMA_VERSION_PATTERN_V2 } from "./version.js";

/**
 * v2 primitives: identifiers for the pipeline graph nodes, the v2 schema
 * version pattern, and the provenance shapes. Patterns are kept as exported
 * strings because the hand-authored JSON Schema files embed the same
 * values; parity tests fail when the two drift apart.
 */

export const PERSONA_ID_PATTERN = "^persona_[a-z0-9_]{1,100}$";
export const SCENARIO_ID_PATTERN = "^scenario_[a-z0-9_]{1,100}$";
export const PROMPT_ID_PATTERN = "^prompt_[a-z0-9_]{1,100}$";
export const RUN_ID_PATTERN = "^run_[a-z0-9_]{1,100}$";
export const METRICS_ID_PATTERN = "^mtrc_[a-z0-9_]{1,100}$";
export const GRAPH_ID_PATTERN = "^graph_[a-z0-9_]{1,100}$";

export const SchemaVersionV2Schema = patternSchema(
  SCHEMA_VERSION_PATTERN_V2,
  "schema_version must be SemVer compatible with major 2 (e.g. 2.0.0)",
);
export const PersonaIdSchema = patternSchema(
  PERSONA_ID_PATTERN,
  "persona_id must look like persona_<slug>",
);
export const ScenarioIdSchema = patternSchema(
  SCENARIO_ID_PATTERN,
  "scenario_id must look like scenario_<slug>",
);
export const PromptIdSchema = patternSchema(
  PROMPT_ID_PATTERN,
  "prompt_id must look like prompt_<slug>",
);
export const RunIdSchema = patternSchema(RUN_ID_PATTERN, "run_id must look like run_<slug>");
export const MetricsSnapshotIdSchema = patternSchema(
  METRICS_ID_PATTERN,
  "metrics_id must look like mtrc_<slug>",
);
export const GraphIdSchema = patternSchema(
  GRAPH_ID_PATTERN,
  "graph_id must look like graph_<slug>",
);

/**
 * Where a stored value came from and when it was produced — required on
 * every generated/monitored v2 record (e.g. source "gemini-2.5-pro" or
 * "dataforseo").
 */
export const ProvenanceSchema = z.strictObject({
  source: z.string().min(1).max(200),
  retrieved_at: IsoDateTimeSchema,
});

/**
 * One evidence-backed claim. The explicit assumption flag is the escape
 * hatch for facts the crawled site does not state: an uncited trait must be
 * flagged `assumption: true`, never silently presented as evidenced
 * (blueprint validation family 1 — evidence integrity).
 */
export const TraitSchema = z
  .strictObject({
    text: z.string().min(1).max(500),
    assumption: z.boolean(),
    evidence_urls: z.array(UrlSchema).max(100),
  })
  .superRefine((trait, ctx) => {
    if (!trait.assumption && trait.evidence_urls.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence_urls"],
        message:
          'a non-assumption trait must cite at least one evidence URL (otherwise set assumption: true)',
      });
    }
  });
