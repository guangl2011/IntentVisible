import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { middleware } from "./middleware";

/**
 * The hosted proxy rewrites x-forwarded-host to the internal upstream host
 * while the browser origin stays the public hosted URL. Next.js Server
 * Actions abort such requests ("Invalid Server Actions request"), so the
 * middleware must reconcile the headers for EVERY request — including the
 * root route, whose rewrite must also carry the reconciled headers
 * downstream (the login Server Action POSTs to /).
 */

const PUBLIC_ORIGIN = "https://1ebcqaukxp-3000.hosted.obvious.ai";
const INTERNAL_HOST = "3000-id5offrwj3hj3mibwwjui.e2b.app";

function proxiedRequest(
  path: string,
  method: "GET" | "POST" = "GET",
): NextRequest {
  const headers = new Headers({
    "x-forwarded-host": INTERNAL_HOST,
    origin: PUBLIC_ORIGIN,
  });
  return new NextRequest(`https://${INTERNAL_HOST}${path}`, {
    method,
    headers,
  });
}

/** Downstream request headers that middleware passed into the response. */
function overriddenRequestHeaders(response: NextResponse): Headers {
  const headers = new Headers();
  for (const name of (
    response.headers.get("x-middleware-override-headers") ?? ""
  ).split(",")) {
    const value = response.headers.get(`x-middleware-request-${name}`);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

describe("middleware forwarded-header normalization", () => {
  beforeEach(() => {
    // Sanity: the fixture headers really do mismatch, like the hosted proxy.
    expect(INTERNAL_HOST).not.toBe(new URL(PUBLIC_ORIGIN).host);
  });

  it("GET / rewrites to /login and carries normalized forwarded headers downstream", () => {
    const response = middleware(proxiedRequest("/"));

    expect(response.headers.get("x-middleware-rewrite")).toContain("/login");
    const downstream = overriddenRequestHeaders(response);
    expect(downstream.get("x-forwarded-host")).toBe(
      new URL(PUBLIC_ORIGIN).host,
    );
    expect(downstream.get("x-forwarded-proto")).toBe("https");
  });

  it("POST / (the login Server Action target) also normalizes instead of bypassing", () => {
    const response = middleware(proxiedRequest("/", "POST"));

    expect(response.headers.get("x-middleware-rewrite")).toContain("/login");
    const downstream = overriddenRequestHeaders(response);
    expect(downstream.get("x-forwarded-host")).toBe(
      new URL(PUBLIC_ORIGIN).host,
    );
    expect(downstream.get("x-forwarded-proto")).toBe("https");
  });

  it("non-root requests keep their route and get the same normalization", () => {
    const response = middleware(proxiedRequest("/queue"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    const downstream = overriddenRequestHeaders(response);
    expect(downstream.get("x-forwarded-host")).toBe(
      new URL(PUBLIC_ORIGIN).host,
    );
    expect(downstream.get("x-forwarded-proto")).toBe("https");
  });

  it("non-root requests without mismatched forwarded headers are passed through untouched", () => {
    const request = new NextRequest("https://localhost:3000/queue", {
      headers: new Headers({ "x-forwarded-host": "localhost:3000" }),
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    const downstream = overriddenRequestHeaders(response);
    expect(downstream.get("x-forwarded-host")).toBe("localhost:3000");
    expect(downstream.get("x-forwarded-proto")).toBeNull();
  });
});
