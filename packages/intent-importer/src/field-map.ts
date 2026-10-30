/**
 * Solix → Intent Schema v1 field mapping table.
 *
 * Normative source: plan section 2.1 — eleven inherited fields; everything
 * measurement-derived is nulled or preserved only as a legacy measured value
 * under measurement_status "imported"; context-only columns are dropped but
 * reported, never silently ignored (spec art_KGYzMB5Z, importer row).
 *
 * The real Solix export may name columns differently; columnAliases in
 * ImportOptions remaps headers so importing the real file is a config
 * change, not a code change.
 */

/** Canonical Solix column names the importer understands. */
export const SOLIX_FIELDS = [
  "Intent Name",
  "Prompt",
  "Buyer Stage",
  "Intent Category",
  "Pain Point",
  "Persona",
  "Language",
  "Country",
  "Brand",
  "Recommended Content",
  "Recommended CTA",
  "Visibility (%)",
  "Monthly Search Volume",
  "Source Models",
  "Source",
  "Date",
  "Revenue Expansion",
  "Market Expansion",
  "Industry",
  "Competitors",
  "Scope",
  "SKU IDs",
] as const;
export type SolixField = (typeof SOLIX_FIELDS)[number];

/** Why a column is mapped the way it is — drives the validation report. */
export type MappingKind = "inherited" | "measurement-derived" | "context" | "importer-extension";

export interface FieldMapping {
  solixField: SolixField;
  /** Target field on IntentRecord, or null when the column has no schema home. */
  target: string | null;
  kind: MappingKind;
  /** Plan section 2.1 rationale; surfaced in the import report. */
  note: string;
}

export const SOLIX_FIELD_MAP: readonly FieldMapping[] = [
  // --- The eleven inherited fields (plan section 2.1 必须继承) ---
  {
    solixField: "Intent Name",
    target: "intent_name",
    kind: "inherited",
    note: "plan section 2.1: inherited verbatim; also seeds the stable intent_id slug",
  },
  {
    solixField: "Prompt",
    target: "prompts",
    kind: "inherited",
    note: "plan section 2.1: inherited; rows sharing brand and intent name merge into one record's prompt list",
  },
  {
    solixField: "Buyer Stage",
    target: "buyer_stage",
    kind: "inherited",
    note: "plan section 2.1: inherited; normalized to the Intent Schema v1 vocabulary",
  },
  {
    solixField: "Intent Category",
    target: "intent_category",
    kind: "inherited",
    note: "plan section 2.1: inherited; normalized to the Intent Schema v1 vocabulary",
  },
  {
    solixField: "Pain Point",
    target: "pain_point",
    kind: "inherited",
    note: "plan section 2.1: inherited verbatim",
  },
  {
    solixField: "Persona",
    target: "persona",
    kind: "inherited",
    note: "plan section 2.1: inherited verbatim",
  },
  {
    solixField: "Language",
    target: "language",
    kind: "inherited",
    note: "plan section 2.1: inherited; normalized to ISO 639-1",
  },
  {
    solixField: "Country",
    target: "country",
    kind: "inherited",
    note: "plan section 2.1: inherited; normalized to ISO 3166-1 alpha-2",
  },
  {
    solixField: "Brand",
    target: "brand_id",
    kind: "inherited",
    note: "plan section 2.1: inherited; slugged into the brand_<slug> identifier",
  },
  {
    solixField: "Recommended Content",
    target: "recommended_content",
    kind: "inherited",
    note: "plan section 2.1: inherited verbatim",
  },
  {
    solixField: "Recommended CTA",
    target: "recommended_cta",
    kind: "inherited",
    note: "plan section 2.1: inherited verbatim",
  },

  // --- Measurement-derived fields (plan section 2.1 必须调整) ---
  {
    solixField: "Visibility (%)",
    target: "visibility_pct",
    kind: "measurement-derived",
    note: "plan section 2.1: standalone mode maps to null; a legacy measured value is preserved only under measurement_status 'imported'",
  },
  {
    solixField: "Monthly Search Volume",
    target: "monthly_search_volume",
    kind: "measurement-derived",
    note: "plan section 2.1: standalone mode maps to null; a legacy measured value is preserved only under measurement_status 'imported'",
  },
  {
    solixField: "Source Models",
    target: "measurement_source",
    kind: "measurement-derived",
    note: "plan section 2.1: 'source' split — the measuring system, not the generating model",
  },
  {
    solixField: "Source",
    target: "evidence_urls",
    kind: "measurement-derived",
    note: "plan section 2.1: 'source' split — URLs become evidence_urls so every record stays traceable",
  },
  {
    solixField: "Date",
    target: null,
    kind: "measurement-derived",
    note: "plan section 2.1: observed_at of a measurement; IntentRecord has no such field and generated_at would conflate measurement with generation — dropped and reported",
  },
  {
    solixField: "Revenue Expansion",
    target: null,
    kind: "measurement-derived",
    note: "plan section 2.1: visibility-interval label, measurement-derived; replaced by opportunity_type: 'hypothesis' on every imported record",
  },
  {
    solixField: "Market Expansion",
    target: null,
    kind: "measurement-derived",
    note: "plan section 2.1: visibility-interval label, measurement-derived; replaced by opportunity_type: 'hypothesis' on every imported record",
  },

  // --- Context-only columns: no schema home, dropped and reported ---
  {
    solixField: "Industry",
    target: null,
    kind: "context",
    note: "context column from the Solix sample; brand-level categorization belongs to BrandProfile (url-extractor), not the intent record",
  },
  {
    solixField: "Competitors",
    target: null,
    kind: "context",
    note: "context column from the Solix sample; competitor evidence belongs to BrandProfile.competitor_brands, not the intent record",
  },

  // --- Importer extensions beyond the Solix sample ---
  {
    solixField: "Scope",
    target: "scope",
    kind: "importer-extension",
    note: "optional column ('brand' | 'product'); defaults to product when SKU IDs are present, brand otherwise",
  },
  {
    solixField: "SKU IDs",
    target: "sku_ids",
    kind: "importer-extension",
    note: "optional semicolon-separated SKUs; authoritative linkage also emits SkuIntentMapping records downstream",
  },
];

/** Constant values every imported record carries (plan section 2.1 adjustments). */
export const IMPORTED_RECORD_DEFAULTS = {
  generation_method: "imported",
  measurement_status: "imported",
  /**
   * Confidence is evidence support, not a conversion prediction (plan
   * section 2.1). The golden corpus is human-curated but the importer does
   * not measure evidence depth, so it claims no more than "medium".
   */
  confidence: "medium",
  opportunity_type: "hypothesis",
} as const;
