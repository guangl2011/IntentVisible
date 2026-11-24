"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { ReactNode } from "react";

import type { Dictionary, Locale } from "./dictionary";
import { dictionaryFor } from "./dictionary";
import { DEFAULT_LOCALE, saveSettings } from "../settings";

/**
 * Locale context for the plugin (design v1.5 §0.6 rule 2). The layout
 * seeds it from the locale cookie so the first server-rendered paint is
 * already in the chosen language; the Settings picker updates state (the
 * whole tree re-renders) and persists to cookie + settings record.
 *
 * The context defaults to English + its dictionary so presentational
 * components render standalone in unit tests without a provider.
 */

interface LocaleContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const en = dictionaryFor("en");

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: en,
  setLocale: () => undefined,
});

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    saveSettings({ locale: next });
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: dictionaryFor(locale), setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** The current locale's dictionary. Every plugin string comes from here. */
export function useT(): Dictionary {
  return useContext(LocaleContext).t;
}

/** Locale + setter, for the Settings language picker. */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const { locale, setLocale } = useContext(LocaleContext);
  return { locale, setLocale };
}
