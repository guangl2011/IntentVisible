import { describe, expect, it } from "vitest";

import { CandidateParseError, parseCandidates } from "../src/parse.js";
import { PDP_URL, SPECS_URL, baseCandidate, candidatesJson } from "./fixtures.js";

describe("parseCandidates", () => {
  it("parses a bare JSON array of candidates", () => {
    const parsed = parseCandidates(candidatesJson([baseCandidate()]));
    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.dropped).toEqual([]);
    expect(parsed.candidates[0]?.intent_name).toBe("Camping Fridge Runtime");
    expect(parsed.candidates[0]?.topic).toBe("camping_fridge_runtime");
  });

  it("parses fenced output and prose around the array", () => {
    const text = "Here are the candidates:\n```json\n" + candidatesJson([baseCandidate()]) + "\n```";
    const parsed = parseCandidates(text);
    expect(parsed.candidates).toHaveLength(1);
  });

  it("extracts the outermost array from prose-wrapped JSON", () => {
    const text = "Result: " + candidatesJson([baseCandidate()]) + " — end.";
    const parsed = parseCandidates(text);
    expect(parsed.candidates).toHaveLength(1);
  });

  it("drops malformed entries as schema_invalid instead of failing the batch", () => {
    const good = baseCandidate();
    const bad = { ...baseCandidate(), intent_name: "Broken", prompts: "not-an-array" };
    const parsed = parseCandidates(candidatesJson([good, bad, good]));
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.dropped).toHaveLength(1);
    expect(parsed.dropped[0]?.reason).toBe("schema_invalid");
    expect(parsed.dropped[0]?.intent_name).toBe("Broken");
    expect(parsed.dropped[0]?.detail).toContain("prompts");
  });

  it("keeps unknown extra keys out via strict parsing (they fail, not pass)", () => {
    const extra = { ...baseCandidate(), surprise: true };
    const parsed = parseCandidates(candidatesJson([extra]));
    expect(parsed.candidates).toHaveLength(0);
    expect(parsed.dropped[0]?.reason).toBe("schema_invalid");
  });

  it("throws CandidateParseError when no array is present", () => {
    expect(() => parseCandidates("no json here at all")).toThrow(CandidateParseError);
    expect(() => parseCandidates("{\"a\": 1}")).toThrow(CandidateParseError);
  });

  it("throws CandidateParseError on invalid JSON inside the array", () => {
    expect(() => parseCandidates("[{oops}]")).toThrow(CandidateParseError);
  });

  it("reports a non-array JSON body as not an array", () => {
    expect(() => parseCandidates(JSON.stringify({ a: 1 }))).toThrow(/not a candidate array/);
  });

  it("carries the reported citation URLs through", () => {
    const candidate = baseCandidate({ evidence_urls: [PDP_URL, SPECS_URL] });
    const parsed = parseCandidates(candidatesJson([candidate]));
    expect(parsed.candidates[0]?.evidence_urls).toEqual([PDP_URL, SPECS_URL]);
  });
});
