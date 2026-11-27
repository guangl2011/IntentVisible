"use client";

import type { ReactNode } from "react";

import { LocaleProvider } from "../../../../lib/plugin/i18n/locale";
import { PluginSideNav } from "./plugin-side-nav";

/**
 * The plugin's app frame (DeepLumen-embedded menu style; the Nov 26 brief
 * supersedes design v1.5 §0.6 rule 1's top-nav decision): a fixed left
 * sidebar with the seven-item menu and a full-width content area to the
 * right. The plugin home stays the post-login landing page, reached via
 * the brand link. The locale provider seeds from the locale cookie read
 * in the layout, so first paint already matches the chosen language.
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
        <PluginSideNav />
        <main className="iv-content">{children}</main>
      </div>
    </LocaleProvider>
  );
}
