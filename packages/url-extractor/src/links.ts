import { parse } from "node-html-parser";

/**
 * Same-host link extraction for the crawl frontier. Kept separate from
 * profile extraction: this exists to bound where the crawler goes, not to
 * interpret what a page means.
 */
export function extractLinks(rawHtml: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const root = parse(rawHtml);
  const links = new Set<string>();
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      continue;
    }
    if (resolved.host !== base.host) {
      continue;
    }
    resolved.hash = "";
    links.add(resolved.toString());
  }
  return [...links];
}

/** Canonical key for the crawl's seen-set: no fragment, host lowercased. */
export function urlKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.toString();
}
