import { describe, expect, it } from "vitest";

import { IntentRecordSchema } from "../src/index.js";
import { mutatedFixture, specExampleIntentRecord } from "../src/fixtures.js";

import { ensureParsed, isRejected, issuePaths } from "./helpers.js";

const notMeasured = specExampleIntentRecord;

const measuredRecord = (status: "imported" | "measured") =>
  mutatedFixture(specExampleIntentRecord, {
    measurement_status: status,
    measurement_source: "visible",
    visibility_pct: 34.7,
    monthly_search_volume: 1200,
    confidence: status === "measured" ? "high" : "medium",
  });

describe("standalone-mode measurement invariant (Zod superRefinement)", () => {
  it("accepts a fully-not_measured record", () => {
    const record = ensureParsed(IntentRecordSchema, notMeasured);
    expect(record.visibility_pct).toBeNull();
    expect(record.monthly_search_volume).toBeNull();
    expect(record.measurement_source).toBeNull();
  });

  it("rejects visibility_pct on a not_measured record", () => {
    expect(
      isRejected(IntentRecordSchema, mutatedFixture(notMeasured, { visibility_pct: 78.4 })),
    ).toBe(true);
  });

  it("rejects monthly_search_volume on a not_measured record", () => {
    expect(
      isRejected(IntentRecordSchema, mutatedFixture(notMeasured, { monthly_search_volume: 1200 })),
    ).toBe(true);
  });

  it("rejects a non-null measurement_source on a not_measured record", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(notMeasured, { measurement_source: "visible" }),
      ),
    ).toBe(true);
  });

  it("names every violating field in one pass", () => {
    const paths = issuePaths(
      IntentRecordSchema,
      mutatedFixture(notMeasured, {
        visibility_pct: 78.4,
        monthly_search_volume: 1200,
        measurement_source: "visible",
      }),
    );
    expect(paths).toContain("visibility_pct");
    expect(paths).toContain("monthly_search_volume");
    expect(paths).toContain("measurement_source");
  });

  it("points the issue at the measured field, not the status field", () => {
    const paths = issuePaths(
      IntentRecordSchema,
      mutatedFixture(notMeasured, { visibility_pct: 1 }),
    );
    expect(paths).toEqual(["visibility_pct"]);
  });

  it("rejects 0 and fractional measured values too (0 is a measurement, not a null)", () => {
    expect(isRejected(IntentRecordSchema, mutatedFixture(notMeasured, { visibility_pct: 0 }))).toBe(
      true,
    );
    expect(
      isRejected(IntentRecordSchema, mutatedFixture(notMeasured, { monthly_search_volume: 0 })),
    ).toBe(true);
  });

  it("accepts imported and measured records carrying measured values", () => {
    expect(isRejected(IntentRecordSchema, measuredRecord("imported"))).toBe(false);
    expect(isRejected(IntentRecordSchema, measuredRecord("measured"))).toBe(false);
  });

  it("accepts a measured record with only some measured fields set", () => {
    const partial = mutatedFixture(specExampleIntentRecord, {
      measurement_status: "measured",
      measurement_source: "visible",
      visibility_pct: 40,
    });
    expect(isRejected(IntentRecordSchema, partial)).toBe(false);
  });

  it("has no construction path that produces a not_measured record with measured values", () => {
    // The invariant is enforced by validation, not convention: any record
    // shaped like a fabrication must fail, regardless of origin.
    const fabricated = {
      ...mutatedFixture(notMeasured, { visibility_pct: 99.9, confidence: "high" }),
    };
    expect(isRejected(IntentRecordSchema, fabricated)).toBe(true);
  });
});
