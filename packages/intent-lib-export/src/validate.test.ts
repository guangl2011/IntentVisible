/**
 * Data Mode header validation (blueprint Verification #7): a simulated
 * lib with no mode header fails. Both renditions — machine YAML and human
 * document — are validated, and a valid export passes clean.
 */

import { describe, expect, it } from "vitest";

import { testLib } from "./fixtures.js";
import { renderDocumentExport, validateDocumentExport } from "./document.js";
import { parseYamlExport, renderYamlExport, type YamlRecord } from "./yaml.js";

const yaml = renderYamlExport(testLib());
const document = renderDocumentExport(testLib());

function withoutDataModeHeader(text: string): string {
  return text
    .split("\n")
    .filter((line) => line !== "data_mode: llm_simulated")
    .join("\n");
}

describe("machine YAML export validation", () => {
  it("accepts a rendered export", () => {
    const parsed = parseYamlExport(yaml);
    expect(parsed.data_mode).toBe("llm_simulated");
    expect(parsed.export_spec).toBe("Buyer Intent GEO Export v2");
  });

  it("fails when the Data Mode header is stripped — mode leakage guard", () => {
    expect(() => parseYamlExport(withoutDataModeHeader(yaml))).toThrowError(
      /missing its Data Mode header/,
    );
  });

  it("fails when the header names an unknown mode", () => {
    const forged = yaml.replace(
      "data_mode: llm_simulated",
      "data_mode: measured",
    );
    expect(() => parseYamlExport(forged)).toThrowError(/Export Spec v2 conformance/);
  });

  it("fails when a record omits its Prompt field", () => {
    const stripped = yaml.replace("  Prompt:", "  PromptX:");
    expect(() => parseYamlExport(stripped)).toThrowError(/Export Spec v2 conformance/);
  });
});

describe("human document export validation", () => {
  it("accepts a rendered export and returns its mode", () => {
    expect(validateDocumentExport(document)).toEqual({ dataMode: "llm_simulated" });
  });

  it("fails when the first line is not the Data Mode header", () => {
    const headerless = document.split("\n").slice(3).join("\n");
    expect(() => validateDocumentExport(headerless)).toThrowError(/Data Mode header/);
  });

  it("fails when the header names an unknown mode", () => {
    expect(() =>
      validateDocumentExport(document.replace("Data Mode: llm_simulated", "Data Mode: measured")),
    ).toThrowError(/Data Mode header/);
  });

  it("fails on an empty document", () => {
    expect(() => validateDocumentExport("")).toThrowError(/Data Mode header/);
  });
});

describe("data mode + provenance carried end to end", () => {
  it("stamps every record with the lib's data mode and a provenance block", () => {
    const parsed = parseYamlExport(yaml);
    expect(parsed.records.length).toBeGreaterThan(0);
    for (const record of parsed.records as YamlRecord[]) {
      expect(record["Data Mode"]).toBe(parsed.data_mode);
      expect(record.Provenance.source).toBe("gemini-2.5-pro");
      expect(record.Provenance.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(record.Date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.Source).toBe("chatgpt_search, perplexity");
    }
  });

  it("accepts provider_measured mode in both renditions", () => {
    const measuredYaml = yaml
      .replace("data_mode: llm_simulated", "data_mode: provider_measured")
      .replace(/Data Mode: llm_simulated/g, "Data Mode: provider_measured");
    expect(parseYamlExport(measuredYaml).data_mode).toBe("provider_measured");
    expect(validateDocumentExport("Data Mode: provider_measured\n")).toEqual({
      dataMode: "provider_measured",
    });
  });
});
