/**
 * The reserved keyword-data provider surface (blueprint Stage A.3 code
 * sample). `KeywordVolume` is the core-schema DemandEstimate contract under
 * its blueprint name, so every provider — the LLM default here or a measured
 * DataForSEO/Visible impl later — emits the same shape and the same
 * data_mode/provenance guarantees.
 */

import type { z } from "zod";

import type {
  CountryCodeSchema,
  DemandEstimateSchema,
  LanguageCodeSchema,
} from "@intentvisible/core-schema";

/** Blueprint name for the core-schema demand-estimate record. */
export type KeywordVolume = z.output<typeof DemandEstimateSchema>;
export type CountryCode = z.output<typeof CountryCodeSchema>;
export type LanguageCode = z.output<typeof LanguageCodeSchema>;

/**
 * Monthly search volume + 12-month trend for AI-tool usage of these queries.
 *
 * The lightweight default fills `tier` and leaves `monthly_volume` null — an
 * LLM volume guess is never presented as a number (blueprint: estimates are
 * consumed only as tiers). A measured provider fills the volume and flips
 * `data_mode` to "provider_measured". Callers cannot tell the two apart by
 * anything other than the data_mode/provenance fields.
 */
export interface KeywordDataProvider {
  aiSearchVolume(
    keywords: string[],
    country: CountryCode,
    language: LanguageCode,
  ): Promise<KeywordVolume[]>;
}
