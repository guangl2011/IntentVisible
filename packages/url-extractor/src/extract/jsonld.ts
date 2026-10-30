/**
 * JSON-LD collection (spec Flow, Extract row: "JSON-LD / Schema.org Product
 * parsing"). Malformed blocks are skipped, never fatal — other blocks on
 * the page may still parse. Collection is structural: it flattens arrays
 * and @graph containers and matches @type case-insensitively.
 */

/** Any object found in a JSON-LD script block or nested in a @graph. */
export interface JsonLdNode {
  "@type"?: unknown;
  [key: string]: unknown;
}

const JSON_LD_SCRIPT_PATTERN =
  /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function collectJsonLd(rawHtml: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const match of rawHtml.matchAll(JSON_LD_SCRIPT_PATTERN)) {
    const raw = match[1];
    if (raw === undefined) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    pushNodes(parsed, nodes);
  }
  return nodes;
}

function pushNodes(value: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      pushNodes(item, out);
    }
    return;
  }
  if (isJsonObject(value)) {
    out.push(value);
    const graph = value["@graph"];
    if (Array.isArray(graph)) {
      for (const item of graph) {
        pushNodes(item, out);
      }
    }
  }
}

export function isJsonObject(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasJsonLdType(node: JsonLdNode, type: string): boolean {
  const value = node["@type"];
  const types = Array.isArray(value) ? value : [value];
  return types.some((candidate) => typeof candidate === "string" && candidate.toLowerCase() === type.toLowerCase());
}

export function findTypedNodes(nodes: JsonLdNode[], type: string): JsonLdNode[] {
  return nodes.filter((node) => hasJsonLdType(node, type));
}

/** Trimmed string value of a JSON-LD field, or null when absent/empty. */
export function jsonLdString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Numeric JSON-LD value (numbers, or numeric strings like "499.00"). */
export function jsonLdNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (value.trim().length > 0 && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
