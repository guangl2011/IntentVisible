import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { dictionaryFor } from "../../src/lib/plugin/i18n/dictionary";

/**
 * i18n red lines (design v1.5 §0.6 rule 2): en and zh carry the exact
 * same key tree, no English dictionary string sneaks CJK characters in
 * (mixed-language labels like "数据盲区 · Data blind spots" are
 * forbidden), and no plugin component hardcodes a string — everything
 * renders from the dictionary in exactly one language per locale.
 */

/**
 * Recursively collect dictionary leaf values as key-path arrays. String
 * keys are used verbatim (they may contain dots), array items are
 * bracketed, so resolution never guesses a separator.
 */
function leafPaths(value: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (typeof value === "string") return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leafPaths(item, [...prefix, i]));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leafPaths(child, [...prefix, key]),
    );
  }
  // Numbers (none today) and functions (parameterized strings) are
  // structural leaves: their parameter names must still line up, which
  // the type system already enforces on the zh literal.
  return prefix.length === 0 ? [] : [prefix];
}

/** Resolve a leaf's value from its key-path array. */
function resolveLeaf(root: unknown, path: (string | number)[]): string | undefined {
  let node: unknown = root;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key as string];
  }
  return typeof node === "string" ? node : undefined;
}

describe("dictionary completeness — en and zh", () => {
  const en = dictionaryFor("en");
  const zh = dictionaryFor("zh");

  it("has identical leaf key sets in both locales", () => {
    const paths = (locale: unknown) =>
      leafPaths(locale)
        .map((path) => path.map(String).join("\u0000"))
        .sort();
    expect(paths(zh)).toEqual(paths(en));
  });

  it("has no CJK characters in the English dictionary — no mixed-language labels", () => {
    const cjk = /[\u4e00-\u9fff]/;
    // Native language names render in their own language on purpose
    // (the picker labels itself in both locales); everything else must
    // be single-language per locale.
    const nativeNames = new Set(["settings.language.zh"]);
    const leaks: string[] = [];
    for (const path of leafPaths(en)) {
      const key = path.map(String).join(".");
      const value = resolveLeaf(en, path);
      if (!nativeNames.has(key) && value !== undefined && cjk.test(value)) {
        leaks.push(`${key}: ${value}`);
      }
    }
    expect(leaks).toEqual([]);
  });
});

/** Every .tsx file under the plugin app directory, recursively. */
function tsxFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("no hardcoded UI strings in plugin components", () => {
  it("renders no CJK characters in any plugin tsx file — strings come from the dictionary", () => {
    const cjk = /[\u4e00-\u9fff]/;
    const pluginRoot = "src/app/(plugin)";
    const leaks: string[] = [];
    for (const file of tsxFiles(pluginRoot)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (const [i, line] of lines.entries()) {
        if (cjk.test(line)) leaks.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
      }
    }
    expect(leaks).toEqual([]);
  });
});
