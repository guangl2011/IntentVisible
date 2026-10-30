import { describe, expect, it } from "vitest";

import { EvidenceUrlsSchema, UrlSchema } from "./primitives.js";

/**
 * UrlSchema must never throw on malformed input — a validation failure is a
 * typed Zod error, not a crash. Regression tests for the throw-safe refine.
 */
describe("UrlSchema", () => {
  const malformedInputs = [
    "",
    "not a url",
    "http://",
    "https://[invalid",
    "ht tp://example.com",
    "javascript:alert(1)",
    "ftp://example.com/file",
    "mailto:someone@example.com",
    "//example.com/path",
  ];

  it.each(malformedInputs)("returns a typed failure for %p (never throws)", (input) => {
    let result: ReturnType<typeof UrlSchema.safeParse>;
    expect(() => {
      result = UrlSchema.safeParse(input);
    }).not.toThrow();
    expect(result!.success).toBe(false);
    if (!result!.success) {
      expect(result!.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("treats non-http(s) schemes as validation errors with the pinned message", () => {
    const result = UrlSchema.safeParse("ftp://example.com/file");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("URL must use the http or https scheme");
    }
  });

  const validInputs = [
    "http://example.com",
    "https://example.com/path?query=1#fragment",
    "https://sub.domain.example.co.uk/page",
  ];

  it.each(validInputs)("keeps valid input behavior unchanged for %p", (input) => {
    expect(UrlSchema.safeParse(input)).toEqual({ success: true, data: input });
  });

  it("never throws when validating arrays of malformed URLs", () => {
    expect(() => EvidenceUrlsSchema.safeParse(["not a url", "ftp://x"])).not.toThrow();
    expect(EvidenceUrlsSchema.safeParse(["https://example.com/a"])).toEqual({
      success: true,
      data: ["https://example.com/a"],
    });
  });
});
