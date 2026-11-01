/**
 * Golden-file tests, one per export section (blueprint Verification #7):
 * document front matter, a document intent block, the YAML header block,
 * and one self-contained YAML record — plus the full renditions. Golden
 * files live in src/__golden__; regenerate with UPDATE_GOLDENS=1 pnpm test.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DOCUMENT_SEPARATOR, renderDocumentExport } from "./document.js";
import { testLib } from "./fixtures.js";
import { renderYamlExport } from "./yaml.js";

const GOLDEN_DIR = fileURLToPath(new URL("./__golden__", import.meta.url));
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === "1";

function expectGolden(name: string, actual: string): void {
  const path = `${GOLDEN_DIR}/${name}`;
  if (UPDATE_GOLDENS) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, actual);
  }
  expect(existsSync(path), `golden file missing: ${name}`).toBe(true);
  expect(readFileSync(path, "utf8")).toBe(actual);
}

/** The document splits into front matter + one part per intent, on the separator. */
function documentParts(document: string): string[] {
  return document.split(DOCUMENT_SEPARATOR);
}

const lib = testLib();
const document = renderDocumentExport(lib);
const yaml = renderYamlExport(lib);

describe("golden files — human document sections", () => {
  it("front matter: Data Mode header, Industry, Brand, Competitors", () => {
    const [frontMatter] = documentParts(document);
    expectGolden("document-front-matter.golden.txt", frontMatter ?? "");
  });

  it("first intent block: metadata once + Revenue/Market sections", () => {
    const [, firstIntent] = documentParts(document);
    expectGolden("document-intent-block.golden.txt", firstIntent ?? "");
  });

  it("full document", () => {
    expectGolden("document.golden.txt", document);
  });
});

describe("golden files — machine YAML sections", () => {
  it("header block: single metadata block with Data Mode + provenance", () => {
    expectGolden("yaml-header.golden.yaml", yaml.slice(0, yaml.indexOf("records:")));
  });

  it("first record: self-contained with Prompt field", () => {
    const firstRecordStart = yaml.indexOf("  - prompt_id:");
    const secondRecordStart = yaml.indexOf("  - prompt_id:", firstRecordStart + 1);
    expectGolden(
      "yaml-record.golden.yaml",
      yaml.slice(firstRecordStart, secondRecordStart === -1 ? undefined : secondRecordStart),
    );
  });

  it("full YAML export", () => {
    expectGolden("yaml.golden.yaml", yaml);
  });
});
