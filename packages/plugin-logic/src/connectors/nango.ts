/**
 * Nango connector stub (design v1.4 §1.5: Nango = merchant-private OAuth,
 * private data/actions via nango.proxy()).
 *
 * Phase I has no live Nango connection — this stub stands in for the real
 * client behind the same interface, serving only developer-recorded
 * fixtures. No network call exists anywhere in this file. Swapping in the
 * real client later replaces the class, not the call sites: the shape is
 * the Nango proxy contract (providerConfigKey + connectionId + path).
 */

import { ConnectorStubError } from "../errors.js";

/** A request through the Nango proxy — always merchant-scoped and authorized. */
export interface NangoProxyRequest {
  /** Nango integration key, e.g. "google-ga4", "meta-ads". */
  providerConfigKey: string;
  /** The merchant's Nango connection id (token hosting lives in Nango). */
  connectionId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Provider API path, e.g. "/reports/overview". */
  path: string;
  payload?: unknown;
}

export interface NangoProxyResponse {
  status: number;
  data: unknown;
}

/** The interface the real Nango client will implement (Phase II swap-in). */
export interface NangoClient {
  /** Pull merchant-private reports/spend via nango.proxy(). */
  proxy(request: NangoProxyRequest): Promise<NangoProxyResponse>;
  /** Authorized write action (budget change / pause) via nango.proxy(). */
  authorizedWrite(request: NangoProxyRequest): Promise<NangoProxyResponse>;
}

/**
 * Deterministic Nango stub. Constructed with a fixture map keyed by
 * `METHOD providerConfigKey path`; anything unrecorded throws rather than
 * guessing. GET proxy pulls and authorized writes share the fixture space
 * so tests can pin both paths.
 */
export class DeterministicNangoStub implements NangoClient {
  private readonly fixtures: Map<string, NangoProxyResponse>;

  constructor(fixtures: Array<{ request: NangoProxyRequest; response: NangoProxyResponse }>) {
    this.fixtures = new Map(
      fixtures.map((f) => [fixtureKey(f.request), f.response] as const),
    );
  }

  async proxy(request: NangoProxyRequest): Promise<NangoProxyResponse> {
    return this.respond(request);
  }

  async authorizedWrite(request: NangoProxyRequest): Promise<NangoProxyResponse> {
    if (request.method === "GET") {
      throw new ConnectorStubError("authorizedWrite requires a mutating method");
    }
    return this.respond(request);
  }

  private respond(request: NangoProxyRequest): NangoProxyResponse {
    const response = this.fixtures.get(fixtureKey(request));
    if (!response) {
      throw new ConnectorStubError(
        `no deterministic fixture recorded for ${fixtureKey(request)} — stubs never fabricate provider data`,
      );
    }
    return response;
  }
}

function fixtureKey(request: NangoProxyRequest): string {
  return `${request.method} ${request.providerConfigKey} ${request.path}`;
}
