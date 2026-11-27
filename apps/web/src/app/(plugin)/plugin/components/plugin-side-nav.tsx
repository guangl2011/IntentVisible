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
  IconPlan,
  IconSettings,
  IconTraffic,
  IconYield,
  PluginLogo,
} from "./icons";

/**
 * Left sidebar menu (DeepLumen-embedded style, per the Nov 26 brief that
 * supersedes design v1.5's top-nav decision): a fixed rail inside the
 * plugin frame with exactly seven items, and a full-width content area
 * to the right. The plugin home (/plugin) stays the post-login landing
 * page, reached through the brand link — deliberately not a menu item,
 * so the menu itself is exactly the seven surfaces.
 */

export interface SidebarItem {
  href: string;
  labelKey: keyof Dictionary["nav"];
  icon: ReactNode;
}

/** The 7-item IA, in menu order. Exported so tests assert it without rendering. */
export const SIDEBAR_ITEMS: SidebarItem[] = [
  { href: "/plugin/library", labelKey: "library", icon: <IconLibrary /> },
  { href: "/plugin/audit", labelKey: "audit", icon: <IconAudit /> },
  { href: "/plugin/match", labelKey: "match", icon: <IconMatch /> },
  { href: "/plugin/ai-traffic", labelKey: "intentTraffic", icon: <IconTraffic /> },
  { href: "/plugin/commission", labelKey: "commission", icon: <IconYield /> },
  { href: "/plugin/plan", labelKey: "plan", icon: <IconPlan /> },
  { href: "/plugin/settings", labelKey: "settings", icon: <IconSettings /> },
];

/** Pure helper: whether the sidebar item owns the given path (its own href or a child route). */
export function sidebarItemIsActive(itemHref: string, pathname: string): boolean {
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

export function PluginSideNav() {
  const t = useT();
  const pathname = usePathname() ?? "/plugin";

  return (
    <nav className="iv-sidebar" aria-label="plugin" data-testid="plugin-sidebar">
      <Link href="/plugin" className="iv-sidebar-brand" data-testid="sidebar-home-link">
        <PluginLogo />
        <span className="iv-sidebar-suffix">{t.nav.appSuffix}</span>
      </Link>
      <ul className="iv-sidebar-items">
        {SIDEBAR_ITEMS.map((item) => {
          const active = sidebarItemIsActive(item.href, pathname);
          return (
            <li key={item.href}>
              <Link href={item.href} className={`iv-sidebar-link${active ? " is-active" : ""}`}>
                {item.icon}
                <span>{t.nav[item.labelKey]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
