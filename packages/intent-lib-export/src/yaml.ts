/**
 * Machine YAML rendition (blueprint Stage C.4): one self-contained record
 * per prompt under a single header block that carries the Data Mode and
 * provenance. Render and parse are two projections of the same view —
 * re-parsing a rendered export reconstructs exactly the same records
 * (Verification #7 round-trip property).
 */

import { z } from "zod";
import { RUN_DATA_MODES } from "@intentvisible/core-schema";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { formatDate, formatVisibilityPct } from "./build.js";
import { LibValidationError } from "./errors.js";
import type { BuyerIntentLib } from "./types.js";

/** `84%`, `83.5%` — the spec's Visibility display format. */
export const VISIBILITY_STRING_PATTERN = /^\d+(\.\d+)?%$/;

export const YamlProvenanceSchema = z.strictObject({
  source: z.string().min(1),
  retrieved_at: z.string().min(1),
});

export const YamlRecordSchema = z.strictObject({
  prompt_id: z.string().min(1),
  intent_id: z.string().min(1),
  Prompt: z.string().min(1),
  Visibility: z.string().regex(VISIBILITY_STRING_PATTERN),
  "Data Mode": z.enum(RUN_DATA_MODES),
  "Buyer Stage": z.string().min(1),
  "Intent Category": z.string().min(1),
  "Pain Point": z.string().nullable(),
  Persona: z.string().nullable(),
  "Scenario Context": z.string().nullable(),
  Language: z.string().min(1),
  Country: z.string().min(1),
  Brand: z.string().min(1),
  Competitors: z.array(z.string()),
  Source: z.string().min(1),
  Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  Provenance: YamlProvenanceSchema,
  "Recommended Content Strategy": z.string().nullable(),
  "Recommended CTA": z.string().nullable(),
});

export const YamlExportSchema = z.strictObject({
  export_spec: z.string().min(1),
  data_mode: z.enum(RUN_DATA_MODES),
  provenance: YamlProvenanceSchema,
  brand: z.string().min(1),
  industry: z.string().nullable(),
  competitors: z.array(z.string()),
  excluded_prompts: z.strictObject({
    below_visibility_floor: z.number().int().min(0),
    noisy_baseline: z.number().int().min(0),
  }),
  records: z.array(YamlRecordSchema),
});

export type YamlExport = z.output<typeof YamlExportSchema>;
export type YamlRecord = z.output<typeof YamlRecordSchema>;

/**
 * Pure projection of the structured lib onto the YAML view. Both
 * renderYamlExport and the round-trip expectations derive from this one
 * function, so the two can never drift apart.
 */
export function toYamlView(lib: BuyerIntentLib): YamlExport {
  const records: YamlRecord[] = lib.intents.flatMap((intent) =>
    [...intent.revenueExpansion, ...intent.marketExpansion].map((prompt) => ({
      prompt_id: prompt.promptId,
      intent_id: intent.intentId,
      Prompt: prompt.text,
      Visibility: formatVisibilityPct(prompt.visibilityPct),
      "Data Mode": prompt.dataMode,
      "Buyer Stage": prompt.buyerStage,
      "Intent Category": prompt.intentCategory,
      "Pain Point": prompt.painPoint,
      Persona: prompt.personaName,
      "Scenario Context": prompt.scenarioContext,
      Language: prompt.language,
      Country: prompt.country,
      Brand: prompt.brandId,
      Competitors: prompt.competitorNames,
      Source: prompt.platforms.join(", "),
      Date: formatDate(prompt.provenance.retrieved_at),
      Provenance: {
        source: prompt.provenance.source,
        retrieved_at: prompt.provenance.retrieved_at,
      },
      "Recommended Content Strategy": prompt.recommendedContent,
      "Recommended CTA": prompt.recommendedCta,
    })),
  );
  return {
    export_spec: lib.exportSpec,
    data_mode: lib.dataMode,
    provenance: { source: lib.provenance.source, retrieved_at: lib.provenance.retrieved_at },
    brand: lib.brandId,
    industry: lib.industry,
    competitors: lib.competitors.map((competitor) => competitor.name),
    excluded_prompts: {
      below_visibility_floor: lib.excluded.belowVisibilityFloor,
      noisy_baseline: lib.excluded.noisyBaseline,
    },
    records,
  };
}

/** Render the machine YAML export: header block first, then one record per prompt. */
export function renderYamlExport(lib: BuyerIntentLib): string {
  // lineWidth 0: never fold a prompt line — prompt wording is preserved verbatim.
  return stringifyYaml(toYamlView(lib), { lineWidth: 0 });
}

/**
 * Parse and validate a machine YAML export. A lib without its Data Mode
 * header fails here — the export is rejected, never silently accepted
 * (Verification #7: a simulated lib with no mode header fails).
 */
export function parseYamlExport(text: string): YamlExport {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    throw new LibValidationError(`export is not parseable YAML: ${String(error)}`);
  }
  if (parsed !== null && typeof parsed === "object" && !("data_mode" in parsed)) {
    throw new LibValidationError(
      "export is missing its Data Mode header (data_mode) — mode leakage guard: a lib must state llm_simulated or provider_measured",
    );
  }
  const result = YamlExportSchema.safeParse(parsed);
  if (!result.success) {
    throw new LibValidationError(
      `export fails Export Spec v2 conformance: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}
