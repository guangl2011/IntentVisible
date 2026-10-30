import { parse, HTMLElement, type Node } from "node-html-parser";
import type { z } from "zod";

import type { FaqEntrySchema, SpecificationEntrySchema } from "@intentvisible/core-schema";

export type FaqEntry = z.output<typeof FaqEntrySchema>;
export type SpecificationEntry = z.output<typeof SpecificationEntrySchema>;

/**
 * Deterministic HTML scanners: titles, meta, CTA labels, heading sections
 * (features / use cases / compatibility / shipping), details-based FAQs,
 * and two-column spec tables. Everything here only reads what the page
 * literally contains — nothing is inferred, so nothing can be fabricated.
 */

export function cleanText(element: Node | HTMLElement | null | undefined): string {
  if (!element) {
    return "";
  }
  const raw = "textContent" in element ? (element.textContent ?? "") : "";
  return raw.replace(/\s+/g, " ").trim();
}

function isElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement;
}

export function parseHtml(rawHtml: string): HTMLElement {
  return parse(rawHtml);
}

export function extractTitle(root: HTMLElement): string | null {
  const title = cleanText(root.querySelector("title"));
  return title.length > 0 ? title : null;
}

export function extractMetaContent(root: HTMLElement, selector: string): string | null {
  const content = root.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
  return content.length > 0 ? content : null;
}

const CTA_PATTERN =
  /\b(buy now|add to cart|add to bag|shop now|check compatibility|check fitment|get a quote|request a quote|find a dealer|find a retailer|where to buy|order now|book a demo|start free trial|contact sales|contact us|compare models|compare now|see all specs|download spec sheet)\b/i;

/** Anchor/button labels that read as purchase-decision calls to action. */
export function extractCtas(root: HTMLElement): string[] {
  const seen = new Set<string>();
  const ctas: string[] = [];
  for (const element of root.querySelectorAll("a, button")) {
    const label = cleanText(element);
    if (label.length === 0 || label.length > 200 || !CTA_PATTERN.test(label)) {
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ctas.push(label);
  }
  return ctas;
}

function isHeading(element: HTMLElement): boolean {
  return /^H[1-6]$/.test((element.rawTagName ?? "").toUpperCase());
}

const SECTION_EXCLUDED_ANCESTORS = new Set(["table", "details", "nav"]);

/** A spec table or details block after a heading is not that section's list. */
function isInsideExcludedContainer(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const tag = (current.rawTagName ?? "").toLowerCase();
    if (SECTION_EXCLUDED_ANCESTORS.has(tag)) {
      return true;
    }
    current = current.parentNode instanceof HTMLElement ? current.parentNode : null;
  }
  return false;
}

function textItemsOf(element: HTMLElement): string[] {
  const tag = (element.rawTagName ?? "").toLowerCase();
  if (tag === "li" || tag === "p") {
    const text = cleanText(element);
    return text.length > 0 ? [text] : [];
  }
  return element
    .querySelectorAll("li, p")
    .filter((item) => !isInsideExcludedContainer(item))
    .map((item) => cleanText(item))
    .filter((text) => text.length > 0);
}

/**
 * Items of sections whose heading matches the pattern: everything until
 * the next heading at the same level (list items or paragraphs).
 */
export function extractHeadingSectionItems(root: HTMLElement, headingPattern: RegExp): string[] {
  const items: string[] = [];
  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!headingPattern.test(cleanText(heading))) {
      continue;
    }
    const parent = heading.parentNode;
    if (!parent) {
      continue;
    }
    const startIndex = parent.childNodes.indexOf(heading);
    for (let i = startIndex + 1; i < parent.childNodes.length; i += 1) {
      const sibling = parent.childNodes[i];
      if (!sibling || !isElement(sibling)) {
        continue;
      }
      if (isHeading(sibling)) {
        break;
      }
      for (const item of textItemsOf(sibling)) {
        items.push(item);
      }
    }
  }
  return items;
}

/** Q&A pairs from <details><summary>question</summary>answer</details>. */
export function extractDetailsFaqs(root: HTMLElement): FaqEntry[] {
  const faqs: FaqEntry[] = [];
  for (const details of root.querySelectorAll("details")) {
    const question = cleanText(details.querySelector("summary"));
    if (question.length === 0) {
      continue;
    }
    const fullText = cleanText(details);
    const answer = fullText.startsWith(question)
      ? fullText.slice(question.length).trim()
      : fullText;
    if (answer.length === 0) {
      continue;
    }
    faqs.push({ question, answer });
  }
  return faqs;
}

/** Name/value pairs from tables where every row is exactly two cells. */
export function extractSpecTableRows(root: HTMLElement): SpecificationEntry[] {
  const rows: SpecificationEntry[] = [];
  for (const table of root.querySelectorAll("table")) {
    for (const row of table.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("th, td");
      if (cells.length !== 2) {
        continue;
      }
      const name = cleanText(cells[0]);
      const value = cleanText(cells[1]);
      if (name.length === 0 || value.length === 0) {
        continue;
      }
      rows.push({ name, value });
    }
  }
  return rows;
}
