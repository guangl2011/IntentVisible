/**
 * Performance-billing engine (design v1.4 §1.7).
 *
 * Model invariants, all enforced here rather than by callers:
 * - Free install, pure performance billing — no base fee, no subscription;
 *   the only rows this engine can produce are usage-based entries.
 * - Track A commission rate is locked to the 5–20% band (v1.3 决策).
 * - Billing base is net sales (the order ledger's net_sales), not gross.
 * - Refunds never edit a commission row: they append a negative
 *   refund_offset ledger row pointing at the entry they offset.
 * - Track B effect fees are rejected until measured, baseline-verified
 *   results exist (§1.7 前置条件 1).
 *
 * Pure functions over validated inputs — no clock, no I/O, no DB.
 */

import { COMMISSION_RATE_MAX, COMMISSION_RATE_MIN } from "@intentvisible/plugin-schema";

import { RateBandError, TrackBNotBillableError } from "./errors.js";

/** Tolerance so band edges survive floating-point rate arithmetic (e.g. 0.0499999999). */
const RATE_EPSILON = 1e-9;

/**
 * The commercial model as a constant, so "free install" is testable rather
 * than folklore. There is deliberately no billing API for anything except
 * usage-based entries.
 */
export const BILLING_MODEL = {
  install_fee: 0,
  subscription_fee: 0,
  /** The only money path: usage charges raised per verified effect. */
  usage_based_only: true,
  /** Track A band, locked in design v1.3 (§1.7). */
  rate_min: COMMISSION_RATE_MIN,
  rate_max: COMMISSION_RATE_MAX,
} as const;

/**
 * Validate a Track A commission rate against the locked 5–20% band.
 * Returns the rate unchanged; throws RateBandError outside the band
 * (edges 0.05 and 0.20 are inclusive — exactly 5% and exactly 20% bill).
 */
export function validateRateBand(rate: number, context = "commission rate"): number {
  if (!Number.isFinite(rate)) {
    throw new RateBandError(`${context} must be a finite number`, rate);
  }
  const withinBand =
    rate >= COMMISSION_RATE_MIN - RATE_EPSILON && rate <= COMMISSION_RATE_MAX + RATE_EPSILON;
  if (!withinBand) {
    throw new RateBandError(
      `${context} ${rate} is outside the locked 5–20% band [${COMMISSION_RATE_MIN}, ${COMMISSION_RATE_MAX}]`,
      rate,
    );
  }
  return rate;
}

/** Round to cents, half away from zero, avoiding float drift on ledger rows. */
export function round2(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
}

/** Provenance fields the Commission page shows per order (design §2.5). */
export interface CommissionProvenance {
  intentId: string | null;
  channel: string;
  trackingCode: string | null;
}

/** Result of the Track A per-order commission calculation. */
export interface CommissionCalculation extends CommissionProvenance {
  orderId: string;
  /** Net-sales billing base (design §1.7: net, not gross). */
  baseAmount: number;
  rate: number;
  /** baseAmount × rate, rounded to cents. */
  amount: number;
  billedPeriodStart: string;
  billedPeriodEnd: string;
}

/**
 * Calculate a Track A commission for one attributed order. The rate is
 * validated against the band before any arithmetic runs.
 */
export function calculateCommission(input: {
  orderId: string;
  netSales: number;
  rate: number;
  billedPeriodStart: string;
  billedPeriodEnd: string;
  provenance: CommissionProvenance;
}): CommissionCalculation {
  const rate = validateRateBand(input.rate, `commission rate for order ${input.orderId}`);
  if (input.netSales < 0) {
    throw new RangeError(`net sales for order ${input.orderId} cannot be negative`);
  }
  return {
    orderId: input.orderId,
    baseAmount: round2(input.netSales),
    rate,
    amount: round2(input.netSales * rate),
    billedPeriodStart: input.billedPeriodStart,
    billedPeriodEnd: input.billedPeriodEnd,
    ...input.provenance,
  };
}

/**
 * A refund offset for a previously calculated commission. `refundShare` is
 * the refunded fraction of the order (0, 1]: a full refund offsets the
 * whole commission. The offset row is strictly negative and carries the
 * ledger id of the entry it offsets — never a destructive edit.
 */
export function calculateRefundOffset(input: {
  original: CommissionCalculation;
  /** Ledger id of the commission entry being offset (assigned on insert). */
  originalEntryId: number;
  /** Refunded fraction of the order, in (0, 1]. */
  refundShare: number;
}): {
  originalEntryId: number;
  amount: number;
  rate: number;
  baseAmount: number;
} {
  if (!Number.isFinite(input.refundShare) || input.refundShare <= 0 || input.refundShare > 1) {
    throw new RangeError(`refundShare must be in (0, 1]; got ${input.refundShare}`);
  }
  const offset = -round2(input.original.amount * input.refundShare);
  if (offset >= 0) {
    throw new RangeError("refund offset must be strictly negative");
  }
  return {
    originalEntryId: input.originalEntryId,
    amount: offset,
    rate: input.original.rate,
    baseAmount: input.original.baseAmount,
  };
}

/** Reconciliation of one order's ledger rows: gross → offsets → net. */
export interface OrderCommissionSummary {
  orderId: string;
  grossCommission: number;
  refundOffsets: number;
  /** What is actually payable: commission plus offsets, floored at 0. */
  netCommission: number;
}

/**
 * Reconcile an order's commission rows. A fully refunded order nets to 0
 * (a full offset exactly cancels the commission); partial refunds net to
 * the unpaid remainder.
 */
export function reconcileOrderCommission(
  commission: CommissionCalculation,
  offsets: Array<{ amount: number }>,
): OrderCommissionSummary {
  const gross = commission.amount;
  const refundTotal = round2(offsets.reduce((sum, o) => sum + o.amount, 0));
  if (refundTotal > 0) {
    throw new RangeError("refund offsets must sum to a non-positive total");
  }
  const net = Math.max(0, round2(gross + refundTotal));
  return {
    orderId: commission.orderId,
    grossCommission: gross,
    refundOffsets: refundTotal,
    netCommission: net,
  };
}

/**
 * Track B effect fee (design §1.7 Track B). Phase I stub: the call is
 * REJECTED with TrackBNotBillableError unless a measured, baseline-verified
 * result exists. Verification means a named method (pre-period baseline or
 * holdout) with a measured (not modeled) provenance source — platform
 * self-reported or modeled lifts can never raise an effect fee.
 */
export interface TrackBVerification {
  method: "pre_period_baseline" | "holdout";
  baselineWindowStart: string;
  baselineWindowEnd: string;
  /** Provenance of the lift: must be "measured" — modeled lifts are not billable. */
  source: "measured";
  /** Verified spend savings or incremental contribution, in billing currency. */
  verifiedAmount: number;
}

export interface TrackBEffectFeeRecord {
  kind: "track_b_effect_fee";
  status: "pending";
  verification: TrackBVerification;
  amount: number;
  /** Track B share ratio/cap are open questions (#12) — the record says so. */
  ratePolicy: "pending_confirmation_#12";
  phase: "phase_ii";
}

/**
 * Raise a Track B effect fee. Throws TrackBNotBillableError when no
 * verification object exists — the Phase I state — or when the verification
 * is not measured-level. With a measured verification the record is still
 * `pending` and carries the pending-#12 rate policy; Track B bills nothing
 * by itself until that decision lands.
 */
export function billTrackBEffectFee(input: {
  verification?: TrackBVerification | undefined;
}): TrackBEffectFeeRecord {
  const verification = input.verification;
  if (!verification) {
    throw new TrackBNotBillableError(
      "Track B effect fees require measured, baseline-verified results; none exist yet (Phase I stub)",
    );
  }
  if (verification.source !== "measured") {
    throw new TrackBNotBillableError(
      `Track B verification provenance must be "measured"; got "${verification.source}" — modeled or platform-reported lifts are not billable`,
    );
  }
  if (!Number.isFinite(verification.verifiedAmount) || verification.verifiedAmount <= 0) {
    throw new TrackBNotBillableError("verified amount must be a positive number");
  }
  return {
    kind: "track_b_effect_fee",
    status: "pending",
    verification,
    amount: round2(verification.verifiedAmount),
    ratePolicy: "pending_confirmation_#12",
    phase: "phase_ii",
  };
}
