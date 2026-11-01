import { z } from "zod";

import { PLATFORMS, RUN_DATA_MODES } from "./enums-v2.js";
import {
  CountryCodeSchema,
  IsoDateTimeSchema,
  LanguageCodeSchema,
  UrlSchema,
} from "./primitives.js";
import {
  PromptIdSchema,
  ProvenanceSchema,
  RunIdSchema,
  SchemaVersionV2Schema,
} from "./primitives-v2.js";

/**
 * One monitoring answer (blueprint Stage C.1): the immutable snapshot of a
 * single simulated or measured answer to a single prompt on one platform.
 * raw_answer is snapshotted before parsing — parsed fields must be
 * reproducible from it (property tests in the metrics package). data_mode
 * is restricted to the measurement-side modes: `llm_estimated` is a
 * demand-side mode and can never describe a run.
 */
export const MonitoringRunSchema = z.strictObject({
  schema_version: SchemaVersionV2Schema,
  run_id: RunIdSchema,
  prompt_id: PromptIdSchema,
  platform: z.enum(PLATFORMS),
  /** Baseline round this run belongs to (1–3 for a standard baseline). */
  round: z.number().int().min(1),
  raw_answer: z.string().min(1).max(100_000),
  /** Content hash of raw_answer; the snapshot key downstream parsers re-derive from. */
  raw_answer_content_hash: z.string().min(1).max(128),
  /** Domains/URLs cited in the answer (simulated: the plausible domain set). */
  citations: z.array(UrlSchema).max(100),
  /** Provider/model that produced the answer, e.g. "gemini-2.5-pro". */
  model_id: z.string().min(1).max(200),
  country: CountryCodeSchema,
  language: LanguageCodeSchema,
  ran_at: IsoDateTimeSchema,
  data_mode: z.enum(RUN_DATA_MODES),
  provenance: ProvenanceSchema,
});
