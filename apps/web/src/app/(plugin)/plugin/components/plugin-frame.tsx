"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

/**
 * The plugin's own app frame (design v1.4 §2.1): a Polaris-faithful shell
 * emulating the Shopify admin embed — a contextual bar naming the app and
 * shop, and one navigation rail grouped exactly as the IA prescribes.
 * The old dashboard topbar (Queue / Research / Marketing Map / …) has no
 * place here; old dashboard pages keep their own chrome.
 */

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * The §2.1 IA — exported so tests can assert the grouping without
 * rendering the client frame.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ href: "/plugin", label: "Overview", exact: true }],
  },
  {
    title: "Intent Library · Build",
    items: [
      { href: "/plugin/site-research", label: "Site Research" },
      { href: "/plugin/marketing-map", label: "Marketing Map" },
      { href: "/plugin/intents", label: "Buyer Intents" },
      { href: "/plugin/products", label: "Products & SKUs" },
      { href: "/plugin/attribution", label: "Attribution" },
    ],
  },
  {
    title: "Intent Audit · Optimize",
    items: [
      { href: "/plugin/audit", label: "Landing Page Audit" },
      { href: "/plugin/ad-optimization", label: "Ad Optimization" },
      { href: "/plugin/ai-insights", label: "AI Insights" },
    ],
  },
  {
    title: "Intent Match · Monetize",
    items: [
      { href: "/plugin/match", label: "Intent → Page" },
      { href: "/plugin/channels", label: "Channels" },
      { href: "/plugin/affiliate-visit", label: "Affiliate Visit" },
      { href: "/plugin/commission", label: "Commission" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/plugin/integrations", label: "Integrations" },
      { href: "/plugin/billing", label: "Billing" },
      { href: "/plugin/uninstall", label: "卸载与数据删除" },
    ],
  },
];

/** True when the item's href is the path the browser is on. */
function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function PluginFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/plugin";

  return (
    <div className="polaris-frame" data-testid="plugin-frame">
      <div className="polaris-contextbar">
        <span className="polaris-contextbar-shop">solix-demo.myshopify.com</span>
        <span className="polaris-contextbar-app">IntentVisible · Shopify plugin</span>
      </div>
      <div className="polaris-body">
        <nav className="polaris-nav" aria-label="Plugin navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="polaris-nav-group">
              <p className="polaris-nav-title">{group.title}</p>
              <ul className="polaris-nav-list">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      {active ? (
                        <span className="polaris-nav-item polaris-nav-active" aria-current="page">
                          {item.label}
                        </span>
                      ) : (
                        <Link className="polaris-nav-item" href={item.href}>
                          {item.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <main className="polaris-content">{children}</main>
      </div>
    </div>
  );
}
