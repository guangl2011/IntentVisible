/**
 * The onboarding market step's vocabulary: a curated country list, each with
 * its primary languages (the blueprint's "country list + primary languages
 * per country"). The United States / English pair is first and is the
 * onboarding default; codes are ISO 3166-1 alpha-2 / ISO 639-1 so they pass
 * the core-schema primitives unchanged on the wire.
 */

export interface MarketCountry {
  code: string;
  name: string;
  languages: string[];
}

export const MARKET_COUNTRIES: readonly MarketCountry[] = [
  { code: "US", name: "United States", languages: ["en", "es"] },
  { code: "CA", name: "Canada", languages: ["en", "fr"] },
  { code: "GB", name: "United Kingdom", languages: ["en"] },
  { code: "AU", name: "Australia", languages: ["en"] },
  { code: "DE", name: "Germany", languages: ["de"] },
  { code: "FR", name: "France", languages: ["fr"] },
  { code: "ES", name: "Spain", languages: ["es"] },
  { code: "IT", name: "Italy", languages: ["it"] },
  { code: "NL", name: "Netherlands", languages: ["nl"] },
  { code: "MX", name: "Mexico", languages: ["es"] },
  { code: "BR", name: "Brazil", languages: ["pt"] },
  { code: "JP", name: "Japan", languages: ["ja"] },
] as const;

export const DEFAULT_COUNTRY = "US";
export const DEFAULT_LANGUAGE = "en";

export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  ja: "Japanese",
};

/** The market the onboarding form starts from — USA / English. */
export function defaultMarket(): { country: string; language: string } {
  return { country: DEFAULT_COUNTRY, language: DEFAULT_LANGUAGE };
}

/** Languages a country offers; unknown codes fall back to the language name map. */
export function languagesFor(countryCode: string): string[] {
  return MARKET_COUNTRIES.find((country) => country.code === countryCode)?.languages ?? [];
}

export function countryName(code: string): string {
  return MARKET_COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}
