import { describe, expect, it } from "vitest";

import { CommissionEntryContract } from "@intentvisible/plugin-schema";

import {
  BILLING_MODEL,
  billTrackBEffectFee,
  calculateCommission,
  calculateRefundOffset,
  reconcileOrderCommission,
  validateRateBand,
  type TrackBVerification,
} from "../src/billing.js";
import { RateBandError, TrackBNotBillableError } from "../src/errors.js";

const period = { billedPeriodStart: "2026-11-01", billedPeriodEnd: "2026-11-30" };
const provenance = { intentId: "intent_s2000_vs_rivals", channel: "play", trackingCode: "IV-S2000" };

describe("free install, pure performance billing (design §1.7)", () => {
  it("charges nothing to install and nothing to subscribe", () => {
    expect(BILLING_MODEL.install_fee).toBe(0);
    expect(BILLING_MODEL.subscription_fee).toBe(0);
  });

  it("only produces usage-based entries — there is no base-fee API", () => {
    // Every exported billing function is per-effect; the model constant
    // is the only statement of the pricing posture.
    expect(BILLING_MODEL.usage_based_only).toBe(true);
  });
});

describe("commission rate band (locked 5–20%)", () => {
  it("accepts the 5% lower edge", () => {
    expect(validateRateBand(0.05)).toBe(0.05);
  });

  it("accepts the 20% upper edge", () => {
    expect(validateRateBand(0.2)).toBe(0.2);
  });

  it("accepts rates inside the band", () => {
    expect(validateRateBand(0.1)).toBe(0.1);
    expect(validateRateBand(0.15)).toBe(0.15);
  });

  it("rejects just below 5%", () => {
    expect(() => validateRateBand(0.049)).toThrow(RateBandError);
    expect(() => validateRateBand(0.0499)).toThrow(RateBandError);
  });

  it("rejects just above 20%", () => {
    expect(() => validateRateBand(0.201)).toThrow(RateBandError);
    expect(() => validateRateBand(0.5)).toThrow(RateBandError);
  });

  it("rejects non-finite rates", () => {
    expect(() => validateRateBand(Number.NaN)).toThrow(RateBandError);
    expect(() => validateRateBand(Number.POSITIVE_INFINITY)).toThrow(RateBandError);
  });

  it("tolerates floating-point noise at the edges", () => {
    expect(validateRateBand(0.05 - 1e-10)).toBe(0.05 - 1e-10);
    expect(validateRateBand(0.2 + 1e-10)).toBe(0.2 + 1e-10);
  });
});

describe("Track A commission calculation (net-sales basis)", () => {
  it("bills net sales × rate, rounded to cents", () => {
    const calc = calculateCommission({
      orderId: "order_1",
      netSales: 199.99,
      rate: 0.1,
      ...period,
      provenance,
    });
    expect(calc.baseAmount).toBe(199.99);
    expect(calc.amount).toBe(20); // 19.999 → 20.00
  });

  it("carries the Commission page provenance (intent / channel / tracking code)", () => {
    const calc = calculateCommission({
      orderId: "order_1",
      netSales: 100,
      rate: 0.05,
      ...period,
      provenance,
    });
    expect(calc.intentId).toBe("intent_s2000_vs_rivals");
    expect(calc.channel).toBe("play");
    expect(calc.trackingCode).toBe("IV-S2000");
  });

  it("rejects negative net sales", () => {
    expect(() =>
      calculateCommission({ orderId: "o", netSales: -1, rate: 0.1, ...period, provenance }),
    ).toThrow(RangeError);
  });

  it("validates the rate band before any arithmetic", () => {
    expect(() =>
      calculateCommission({ orderId: "o", netSales: 100, rate: 0.21, ...period, provenance }),
    ).toThrow(RateBandError);
  });

  it("produces payload that satisfies the plugin-schema commission contract", () => {
    const calc = calculateCommission({
      orderId: "order_1",
      netSales: 200,
      rate: 0.1,
      ...period,
      provenance,
    });
    const payload = CommissionEntryContract.parse({
      entry_type: "commission",
      status: "pending",
      rate: calc.rate,
      base_amount: calc.baseAmount,
      amount: calc.amount,
      offsets_entry_id: null,
    });
    expect(payload.amount).toBe(20);
  });
});

describe("refund offsets (never destructive edits)", () => {
  const original = calculateCommission({
    orderId: "order_1",
    netSales: 400,
    rate: 0.1,
    ...period,
    provenance,
  }); // amount 40

  it("full refund offsets the entire commission", () => {
    const offset = calculateRefundOffset({ original, originalEntryId: 7, refundShare: 1 });
    expect(offset.amount).toBe(-40);
    expect(offset.originalEntryId).toBe(7);
  });

  it("partial refund offsets proportionally", () => {
    const offset = calculateRefundOffset({ original, originalEntryId: 7, refundShare: 0.25 });
    expect(offset.amount).toBe(-10);
  });

  it("rejects refund shares outside (0, 1]", () => {
    expect(() => calculateRefundOffset({ original, originalEntryId: 7, refundShare: 0 })).toThrow(
      RangeError,
    );
    expect(() => calculateRefundOffset({ original, originalEntryId: 7, refundShare: 1.5 })).toThrow(
      RangeError,
    );
  });

  it("reconciles gross → refund offsets → net per order", () => {
    const full = calculateRefundOffset({ original, originalEntryId: 7, refundShare: 1 });
    const summary = reconcileOrderCommission(original, [full]);
    expect(summary).toEqual({
      orderId: "order_1",
      grossCommission: 40,
      refundOffsets: -40,
      netCommission: 0,
    });
  });

  it("reconciles a partial refund to the unpaid remainder", () => {
    const partial = calculateRefundOffset({ original, originalEntryId: 7, refundShare: 0.3 });
    const summary = reconcileOrderCommission(original, [partial]);
    expect(summary.netCommission).toBe(28); // 40 − 12
  });

  it("never lets offsets make the ledger positive", () => {
    expect(() => reconcileOrderCommission(original, [{ amount: 5 }])).toThrow(RangeError);
  });
});

describe("Track B effect fee (Phase I stub)", () => {
  it("rejects billing when no measured results exist", () => {
    expect(() => billTrackBEffectFee({})).toThrow(TrackBNotBillableError);
  });

  it("accepts a measured verification", () => {
    expect(() =>
      billTrackBEffectFee({
        verification: {
          method: "pre_period_baseline",
          baselineWindowStart: "2026-10-01",
          baselineWindowEnd: "2026-10-31",
          source: "measured" as const,
          verifiedAmount: 150,
        },
      }),
    ).not.toThrow();
  });

  it("rejects modeled or platform-reported lifts — only measured provenance bills", () => {
    expect(() =>
      billTrackBEffectFee({
        verification: {
          method: "pre_period_baseline",
          baselineWindowStart: "2026-10-01",
          baselineWindowEnd: "2026-10-31",
          // A modeled lift is exactly what the red line forbids; simulate
          // a caller bypassing the type.
          source: "modeled" as TrackBVerification["source"],
          verifiedAmount: 150,
        },
      }),
    ).toThrow(TrackBNotBillableError);
  });

  it("with measured verification, produces a pending record with the pending-#12 rate policy", () => {
    const record = billTrackBEffectFee({
      verification: {
        method: "holdout",
        baselineWindowStart: "2026-10-01",
        baselineWindowEnd: "2026-10-31",
        source: "measured",
        verifiedAmount: 123.456,
      },
    });
    expect(record.status).toBe("pending");
    expect(record.amount).toBe(123.46);
    expect(record.ratePolicy).toBe("pending_confirmation_#12");
    expect(record.phase).toBe("phase_ii");
  });
});
