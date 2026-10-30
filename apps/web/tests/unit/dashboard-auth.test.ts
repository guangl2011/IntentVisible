import { describe, expect, it } from "vitest";
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionToken,
  isAuthorizedDashboardRequest,
  readSessionCookie,
} from "../../src/lib/dashboard-auth";

describe("dashboardSessionToken", () => {
  it("derives a 64-char hex token from the passcode", () => {
    const token = dashboardSessionToken("correct horse");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic per passcode and differs across passcodes", () => {
    expect(dashboardSessionToken("a")).toBe(dashboardSessionToken("a"));
    expect(dashboardSessionToken("a")).not.toBe(dashboardSessionToken("b"));
  });

  it("returns undefined when no passcode is configured", () => {
    expect(dashboardSessionToken(undefined)).toBeUndefined();
    expect(dashboardSessionToken("")).toBeUndefined();
  });
});

describe("readSessionCookie", () => {
  const request = (cookieHeader?: string) =>
    new Request("https://example.test/", {
      headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
    });

  it("reads the session cookie from a single-cookie header", () => {
    expect(readSessionCookie(request("iv_session=abc123"), "iv_session")).toBe(
      "abc123",
    );
  });

  it("reads the session cookie among several cookies", () => {
    expect(
      readSessionCookie(request("other=x; iv_session=tok; more=y"), "iv_session"),
    ).toBe("tok");
  });

  it("returns null when the cookie is missing", () => {
    expect(readSessionCookie(request("other=x"), "iv_session")).toBeNull();
    expect(readSessionCookie(request(), "iv_session")).toBeNull();
  });
});

describe("isAuthorizedDashboardRequest", () => {
  const token = dashboardSessionToken("test-passcode");
  const request = (cookieHeader?: string) =>
    new Request("https://example.test/api/intents/x/approve", {
      method: "POST",
      headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
    });

  it("accepts a request carrying the correct session token", () => {
    expect(
      isAuthorizedDashboardRequest(
        request(`${DASHBOARD_SESSION_COOKIE}=${token}`),
        token,
      ),
    ).toBe(true);
  });

  it("rejects a wrong token of equal length", () => {
    const wrong = "0".repeat(64);
    expect(
      isAuthorizedDashboardRequest(
        request(`${DASHBOARD_SESSION_COOKIE}=${wrong}`),
        token,
      ),
    ).toBe(false);
  });

  it("rejects tokens of different lengths and malformed cookies", () => {
    expect(
      isAuthorizedDashboardRequest(request(`${DASHBOARD_SESSION_COOKIE}=short`), token),
    ).toBe(false);
    expect(
      isAuthorizedDashboardRequest(request(`${DASHBOARD_SESSION_COOKIE}=a=b=c`), token),
    ).toBe(false);
    expect(isAuthorizedDashboardRequest(request("other=x"), token)).toBe(false);
    expect(isAuthorizedDashboardRequest(request(), token)).toBe(false);
  });

  it("fails closed when no passcode is configured", () => {
    expect(
      isAuthorizedDashboardRequest(
        request(`${DASHBOARD_SESSION_COOKIE}=${token}`),
        undefined,
      ),
    ).toBe(false);
  });
});
