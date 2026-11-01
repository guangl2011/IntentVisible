"use client";

import { useState } from "react";

import {
  MARKET_COUNTRIES,
  countryName,
  defaultMarket,
  languagesFor,
  languageName,
} from "../../../../lib/pipeline/markets";

/**
 * Onboarding step 2: the market. Country + language selectors defaulting to
 * USA / English. The choice seeds every downstream artifact — crawl scope,
 * prompt language, simulated-answer locale — and is editable later; a market
 * change re-baselines monitoring rather than mixing markets in one baseline,
 * and that consequence is surfaced before the customer saves.
 */

export interface MarketPanelProps {
  /** The stored market when a project exists; undefined seeds the USA/English default. */
  country?: string;
  language?: string;
  /** True once a baseline exists — saving a different market re-baselines it. */
  hasBaseline: boolean;
  onSave: (market: { country: string; language: string }) => void;
  busy: boolean;
  error: string | null;
  saved: boolean;
}

export function MarketPanel({
  country,
  language,
  hasBaseline,
  onSave,
  busy,
  error,
  saved,
}: MarketPanelProps) {
  const [selectedCountry, setSelectedCountry] = useState(country ?? defaultMarket().country);
  const [selectedLanguage, setSelectedLanguage] = useState(language ?? defaultMarket().language);

  const changeCountry = (nextCountry: string) => {
    setSelectedCountry(nextCountry);
    // The language must belong to the chosen country — reset to its primary.
    setSelectedLanguage(languagesFor(nextCountry)[0] ?? defaultMarket().language);
  };

  return (
    <div className="card market-panel">
      <h2 className="page-title">Step 2 — market</h2>
      <p className="muted">
        The market seeds every downstream artifact: the crawl scope, the prompt language, and the
        locale of simulated answers. It is editable later.
      </p>
      <form
        className="market-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSave({ country: selectedCountry, language: selectedLanguage });
        }}
      >
        <label className="field">
          Country
          <select
            value={selectedCountry}
            onChange={(event) => changeCountry(event.target.value)}
            aria-label="Country"
          >
            {MARKET_COUNTRIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Language
          <select
            value={selectedLanguage}
            onChange={(event) => setSelectedLanguage(event.target.value)}
            aria-label="Language"
          >
            {languagesFor(selectedCountry).map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted market-choice">
          {countryName(selectedCountry)} — {languageName(selectedLanguage)}
        </p>
        {hasBaseline && (
          <p className="notice" role="note">
            Saving a different market re-baselines monitoring: the existing baseline stays scoped to
            its market and a new baseline starts for the new one. Markets are never mixed in one
            baseline.
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Saving…" : hasBaseline ? "Save market (re-baselines)" : "Save market"}
        </button>
        {saved && (
          <p className="muted" role="status">
            Market saved.
          </p>
        )}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
