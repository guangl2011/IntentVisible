/**
 * treg.to connector stub (design v1.4 §1.5: treg.to = public intelligence
 * and AI tools only — no merchant authorization, our developer key,
 * pay-per-call).
 *
 * Two boundaries are enforced structurally:
 * 1. Type level: the request type carries no merchant/shop fields at all —
 *    there is no place to put private data in a public-intel request.
 * 2. Runtime level: every call runs assertNotMerchantPrivate, which
 *    rejects any payload carrying merchant-tenancy markers (shop ids,
 *    Nango connection ids). Private data and authorized actions belong to
 *    the Nango path (nango.proxy()) — never here.
 *
 * Phase I stub: no network. Calls are answered from developer-recorded
 * fixtures and counted per call (the pay-per-call accounting).
 */

import { ConnectorStubError, PrivateDataRoutingError } from "../errors.js";

/** Public-intel product lines treg.to serves (design §1.2 数据源 #5). */
export const PUBLIC_INTEL_KINDS = [
  "meta_ad_library",
  "google_trends",
  "keyword_intel",
] as const;
export type PublicIntelKind = (typeof PUBLIC_INTEL_KINDS)[number];

/**
 * A treg.to request. Deliberately shaped without any merchant context —
 * the query targets the open web (competitor creative, category trends),
 * not a shop.
 */
export interface PublicIntelRequest {
  kind: PublicIntelKind;
  /** Public query subject, e.g. a competitor brand or a category keyword. */
  query: string;
}

export interface TregtoIntelResult {
  kind: PublicIntelKind;
  query: string;
  /** Developer-recorded fixture payload — deterministic, no live call. */
  payload: unknown;
  /** Provenance label: the stub is never a live measurement. */
  data_mode: "simulated";
}

/**
 * Reject anything carrying merchant-tenancy markers before it reaches the
 * treg.to path. Depth-limited structural check over plain objects/arrays.
 */
const PRIVATE_MARKERS = [
  "shop_id",
  "shopId",
  "shop_domain",
  "shopDomain",
  "nango_connection_id",
  "connectionId",
] as const;

export function assertNotMerchantPrivate(payload: unknown, depth = 0): void {
  if (depth > 5 || payload === null || typeof payload !== "object") return;
  for (const [key, value] of Object.entries(payload)) {
    if ((PRIVATE_MARKERS as readonly string[]).includes(key)) {
      throw new PrivateDataRoutingError(
        `field "${key}" is merchant-private data — private data never routes through treg.to (design §1.5); use the Nango path`,
      );
    }
    assertNotMerchantPrivate(value, depth + 1);
  }
}

/**
 * Deterministic treg.to stub. Requires a developer key (pay-per-call
 * account), serves recorded fixtures per (kind, query), and counts calls —
 * the accounting is the pay-per-call surface in Phase I.
 */
export class DeterministicTregtoStub {
  private callsMade = 0;
  private readonly fixtures: Map<string, unknown>;

  constructor(
    developerKey: string,
    fixtures: Array<{ request: PublicIntelRequest; payload: unknown }>,
  ) {
    if (!developerKey) {
      throw new ConnectorStubError("treg.to stub requires a developer key (pay-per-call)");
    }
    this.fixtures = new Map(
      fixtures.map((f) => [fixtureKey(f.request), f.payload] as const),
    );
  }

  async fetchIntel(request: PublicIntelRequest): Promise<TregtoIntelResult> {
    assertNotMerchantPrivate(request);
    const payload = this.fixtures.get(fixtureKey(request));
    if (payload === undefined) {
      throw new ConnectorStubError(
        `no deterministic fixture recorded for ${fixtureKey(request)} — stubs never fabricate intel`,
      );
    }
    this.callsMade += 1;
    return { kind: request.kind, query: request.query, payload, data_mode: "simulated" };
  }

  /** Pay-per-call meter (design §1.5: 我方 Key 按次计费). */
  getCallsMade(): number {
    return this.callsMade;
  }
}

function fixtureKey(request: PublicIntelRequest): string {
  return `${request.kind}::${request.query}`;
}
