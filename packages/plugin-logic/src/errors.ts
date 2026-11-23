/**
 * Typed errors for the plugin Phase I logic layer. Every failure mode the
 * design names (rate outside the locked band, Track B billed without
 * measured results, a not_measured demand treated as a number, private
 * merchant data routed at treg.to) is a distinct class — callers branch on
 * type, never on message text.
 */

/** Base class — never thrown directly. */
export class PluginLogicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginLogicError";
  }
}

/** A commission rate outside the locked 5–20% band (design §1.7). */
export class RateBandError extends PluginLogicError {
  constructor(
    message: string,
    readonly rate: number,
  ) {
    super(message);
    this.name = "RateBandError";
  }
}

/**
 * Track B (ad-optimization effect fee) billed without verified measured
 * results. Phase I stub: no effect fee can be raised from unverified data
 * (design §1.7 前置条件 1 — 效果必须可验证).
 */
export class TrackBNotBillableError extends PluginLogicError {
  constructor(message: string) {
    super(message);
    this.name = "TrackBNotBillableError";
  }
}

/** Attribution inputs that violate the measurement boundary (design §1.8). */
export class AttributionInputError extends PluginLogicError {
  constructor(message: string) {
    super(message);
    this.name = "AttributionInputError";
  }
}

/** A connector stub was called on a path it has no deterministic fixture for. */
export class ConnectorStubError extends PluginLogicError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorStubError";
  }
}

/**
 * Merchant-private data was offered to the treg.to public-intel path.
 * Design §1.5 分工红线: private data and authorized actions travel through
 * Nango (nango.proxy()) only — treg.to is public intelligence with our
 * developer key, structurally incapable of carrying shop-private payloads.
 */
export class PrivateDataRoutingError extends PluginLogicError {
  constructor(message: string) {
    super(message);
    this.name = "PrivateDataRoutingError";
  }
}
