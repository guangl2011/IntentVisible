import type { Locale } from "./i18n/dictionary";

/**
 * Plugin settings record (design v1.5 §0.6 rule 2): the merchant's plugin
 * preferences — currently the UI locale — persisted twice, per the brief:
 * a cookie (read server-side by the plugin layout for first-paint locale)
 * and a settings record in localStorage alongside the shop binding.
 * Everything here is client-safe and defensive: corrupt storage falls back
 * to the defaults, never a crash.
 */

const SETTINGS_KEY = "iv.plugin.settings";

export const LOCALE_COOKIE = "iv_plugin_locale";

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: Locale[] = ["en", "zh"];

export interface PluginSettings {
  locale: Locale;
}

export function defaultSettings(): PluginSettings {
  return { locale: DEFAULT_LOCALE };
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}

/** Coerce any stored/cookie value into a Locale; anything else defaults. */
export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Locale from the settings record cookie (Next.js cookies() value). */
export function localeFromCookie(cookieValue: string | undefined | null): Locale {
  return normalizeLocale(cookieValue);
}

export function loadSettings(): PluginSettings {
  if (typeof window === "undefined") {
    return defaultSettings();
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw === null) {
      return defaultSettings();
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as { locale?: unknown };
      return { locale: normalizeLocale(record.locale) };
    }
    return defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: PluginSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  document.cookie = `${LOCALE_COOKIE}=${settings.locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
