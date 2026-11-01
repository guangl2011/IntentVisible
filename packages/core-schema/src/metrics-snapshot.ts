import { z } from "zod";

import { CONSENSUS_FLAGS, PLATFORMS, RUN_DATA_MODES } from "./enums-v2.js";
import {
  BrandIdSchema,
  DomainSchema,
  IntentIdSchema,
  IsoDateTimeSchema,
} from "./primitives.js";
import {
  MetricsSnapshotIdSchema,
  PromptIdSchema,
  ProvenanceSchema,
  SchemaVersionV2Schema,
} from "./primitives-v2.js";

/** Citation share of one domain, 0–100 (Monitor Skill §4). */
export const CitationShareSchema = z.strictObject({
  domain: DomainSchema,
  share_pct: z.number().min(0).max(100),
});

/**
 * One published metrics aggregate (blueprint Stage C.2) — pure-function
 * output over parsed runs, never recomputed by consumers. A published
 * metric always carries run count, platforms, date range, provider/model,
 * and data_mode: a number without its provenance block fails validation.
 * The high-differentiation opportunity tag is derived (void_rate_pct ≥ 25),
 * not stored — JSON Schema cannot check arithmetic and a stored derivable
 * flag would drift.
 */
export const MetricsSnapshotSchema = z
  .strictObject({
    schema_version: SchemaVersionV2Schema,
    metrics_id: MetricsSnapshotIdSchema,
    brand_id: BrandIdSchema,
    intent_id: IntentIdSchema,
    /** Absent = pooled across the intent's prompts. */
    prompt_id: PromptIdSchema.optional(),
    /** Absent = pooled across platforms. */
    platform: z.enum(PLATFORMS).optional(),
    visibility_pct: z.number().min(0).max(100),
    top_competitor_id: BrandIdSchema.nullable(),
    leader_gap_pct: z.number().min(-100).max(100).nullable(),
    void_rate_pct: z.number().min(0).max(100),
    sentiment_index: z.number().min(0).max(100),
    citation_share: z.array(CitationShareSchema).max(100),
    consensus: z.enum(CONSENSUS_FLAGS),
    run_count: z.number().int().min(1),
    platforms: z.array(z.enum(PLATFORMS)).min(1),
    date_range: z.strictObject({
      from: IsoDateTimeSchema,
      to: IsoDateTimeSchema,
    }),
    provider_model: z.string().min(1).max(200),
    data_mode: z.enum(RUN_DATA_MODES),
    provenance: ProvenanceSchema,
    generated_at: IsoDateTimeSchema.optional(),
  })
  .superRefine((snapshot, ctx) => {
    const from = new Date(snapshot.date_range.from).getTime();
    const to = new Date(snapshot.date_range.to).getTime();
    if (from > to) {
      ctx.addIssue({
        code: "custom",
        path: ["date_range"],
        message: "date_range.from must not be after date_range.to",
      });
    }
    // Leader gap is top-1 competitor visibility − brand visibility; with no
    // leader there is no gap, and a gap always names its leader.
    const hasLeader = snapshot.top_competitor_id !== null;
    const hasGap = snapshot.leader_gap_pct !== null;
    if (hasLeader !== hasGap) {
      ctx.addIssue({
        code: "custom",
        path: ["leader_gap_pct"],
        message: "top_competitor_id and leader_gap_pct must be set or null together",
      });
    }
  });
