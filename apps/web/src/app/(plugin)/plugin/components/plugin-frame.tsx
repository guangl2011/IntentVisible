"use client";

import type { ReactNode } from "react";

import { LocaleProvider } from "../../../../lib/plugin/i18n/locale";
import { PluginTopNav } from "./plugin-top-nav";

/**
 * The plugin's app frame (design v1.5 §0.6 rule 1): a full-width embedded
 * app — horizontal top navigation (brand + module links with icons +
 * Settings) and a single content column. No left rail: the simulated
 * admin sidebar from v1.4 was rejected because it does not survive the
 * Shopify admin embed. The locale provider seeds from the locale cookie
 * read in the layout, so first paint already matches the chosen language.
 */

export function PluginFrame({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: "en" | "zh";
}) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <div className="iv-frame" data-testid="plugin-frame">
        <PluginTopNav />
        <main className="iv-content">{children}</main>
      </div>
    </LocaleProvider>
  );
}
