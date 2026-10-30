import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "../../src/app/api/cron/expire/route";

describe("cron auth", () => {
  const request = (authorization?: string) =>
    new Request("https://example.test/api/cron/expire", {
      headers: authorization ? { authorization } : {},
    });

  it("accepts a correct bearer token", () => {
    expect(isAuthorizedCronRequest(request("Bearer s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a wrong token of equal length", () => {
    expect(isAuthorizedCronRequest(request("Bearer s3cerx"), "s3cret")).toBe(false);
  });

  it("rejects a wrong token of different length", () => {
    expect(isAuthorizedCronRequest(request("Bearer s3cret2"), "s3cret")).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(isAuthorizedCronRequest(request(), "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(request("s3cret"), "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(request("Basic s3cret"), "s3cret")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(isAuthorizedCronRequest(request("Bearer s3cret"), undefined)).toBe(false);
    expect(isAuthorizedCronRequest(request(), undefined)).toBe(false);
  });
});
