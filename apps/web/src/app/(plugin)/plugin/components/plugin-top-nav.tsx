"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "../../../../lib/plugin/i18n/locale";
import type { Dictionary } from "../../../../lib/plugin/i18n/dictionary";
import type { ReactNode } from "react";
import {
  IconAudit,
  IconLibrary,
  IconMatch,
  IconOverview,
  IconSettings,
  PluginLogo,
} from "./icons";

/**
 * Top navigation (design v1.5 §0.6 rule 1): a full-width horizontal bar —
 * app name + module links with icons + Settings entry — replacing the
 * left rail, matching how DeepLumen renders inside the Shopify admin
 * embed. A contextual second row lists the active module's sub-pages.
 */

type SubnavKey = keyof Dictionary["subnav"];

interface NavModule {
  href: string;
  labelKey: keyof Dictionary["nav"];
  icon: ReactNode;
  /** Sub-pages shown in the contextual second row. */
  subnav: { href: string; labelKey: SubnavKey }[];
}

/** The §0.6 IA — exported so tests can assert the grouping without rendering. */
export const NAV_MODULES: NavModule[] = [
  {
    href: "/plugin",
    labelKey: "overview",
    icon: <IconOverview />,
    subnav: [],
  },
  {
    href: "/plugin/library",
    labelKey: "library",
    icon: <IconLibrary />,
    subnav: [
      { href: "/plugin/site-research", labelKey: "siteResearch" },
      { href: "/plugin/marketing-map", labelKey: "marketingMap" },
      { href: "/plugin/intents", labelKey: "buyerIntents" },
      { href: "/plugin/products", labelKey: "productsSkus" },
      { href: "/plugin/attribution", labelKey: "attribution" },
    ],
  },
  {
    href: "/plugin/audit",
    labelKey: "audit",
    icon: <IconAudit />,
    subnav: [
      { href: "/plugin/audit", labelKey: "landingPageAudit" },
      { href: "/plugin/ad-optimization", labelKey: "adOptimization" },
      { href: "/plugin/ai-insights", labelKey: "aiInsights" },
    ],
  },
  {
    href: "/plugin/match",
    labelKey: "match",
    icon: <IconMatch />,
    subnav: [
      { href: "/plugin/match", labelKey: "intentToPage" },
      { href: "/plugin/channels", labelKey: "channels" },
      { href: "/plugin/affiliate-visit", labelKey: "affiliateVisit" },
      { href: "/plugin/commission", labelKey: "commission" },
    ],
  },
];

const SETTINGS_SUBNAV: NavModule["subnav"] = [
  { href: "/plugin/settings", labelKey: "settingsHome" },
  { href: "/plugin/integrations", labelKey: "integrations" },
  { href: "/plugin/billing", labelKey: "billing" },
  { href: "/plugin/uninstall", labelKey: "uninstall" },
];

/** The subnav group active for a path: the module whose own href or one of its sub-pages is the path. */
export function subnavForPath(pathname: string): NavModule | null {
  for (const module of NAV_MODULES) {
    if (module.href === pathname) return module;
    if (module.subnav.some((item) => item.href === pathname)) return module;
  }
  return null;
}

export function PluginTopNav() {
  const t = useT();
  const pathname = usePathname() ?? "/plugin";
  const activeModule = subnavForPath(pathname);
  const onSettings = pathname.startsWith("/plugin/settings") || SETTINGS_SUBNAV.some((item) => item.href === pathname);

  return (
    <nav className="iv-topnav" aria-label="plugin">
      <div className="iv-topnav-main">
        <Link href="/plugin" className="iv-topnav-brand">
          <PluginLogo />
          <span className="iv-topnav-name">IntentVisible</span>
          <span className="iv-topnav-suffix">{t.nav.appSuffix}</span>
        </Link>
        <ul className="iv-topnav-links">
          {NAV_MODULES.map((module) => {
            const active =
              module.href === "/plugin" ? pathname === "/plugin" : subnavForPath(pathname) === module;
            return (
              <li key={module.href}>
                <Link href={module.href} className={`iv-topnav-link${active ? " is-active" : ""}`}>
                  {module.icon}
                  <span>{t.nav[module.labelKey]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/plugin/settings" className={`iv-topnav-link iv-topnav-settings${onSettings ? " is-active" : ""}`}>
          <IconSettings />
          <span>{t.nav.settings}</span>
        </Link>
      </div>
      {activeModule && activeModule.subnav.length > 0 ? (
        <ul className="iv-topnav-sub" data-testid="subnav">
          {activeModule.subnav.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href} className={`iv-topnav-sublink${active ? " is-active" : ""}`}>
                  {t.subnav[item.labelKey]}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : onSettings ? (
        <ul className="iv-topnav-sub" data-testid="subnav">
          {SETTINGS_SUBNAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href} className={`iv-topnav-sublink${active ? " is-active" : ""}`}>
                  {t.subnav[item.labelKey]}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
