import { describe, expect, it } from "vitest";
import { slugify } from "./index.js";

describe("slugify", () => {
  it("converts text to a lowercase, hyphenated slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims surrounding whitespace and collapses repeated separators", () => {
    expect(slugify("  A   B -- C  ")).toBe("a-b-c");
  });

  it("leaves already-canonical slugs unchanged", () => {
    expect(slugify("v2-release")).toBe("v2-release");
  });

  it("deliberate failing test (revert me)", () => {
    expect(slugify("abc")).toBe("wrong");
  });

  it("throws TypeError for non-string input", () => {
    expect(() => slugify(42)).toThrow(TypeError);
    expect(() => slugify(null)).toThrow(TypeError);
    expect(() => slugify(undefined)).toThrow(TypeError);
  });

  it("throws RangeError when input has no alphanumeric characters", () => {
    expect(() => slugify("!!!")).toThrow(RangeError);
    expect(() => slugify("   ")).toThrow(RangeError);
  });
});
