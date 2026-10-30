import { describe, expect, it } from "vitest";
import {
  OutcomeReportSchema,
  mapOutcomeToStatus,
} from "../../src/lib/outcome";

describe("mapOutcomeToStatus", () => {
  it("maps SUCCEEDED to EXECUTED and FAILED to FAILED", () => {
    expect(mapOutcomeToStatus("SUCCEEDED")).toBe("EXECUTED");
    expect(mapOutcomeToStatus("FAILED")).toBe("FAILED");
  });
});

describe("OutcomeReportSchema", () => {
  it("accepts exactly the two outcome values", () => {
    expect(OutcomeReportSchema.safeParse({ outcome: "SUCCEEDED" }).success).toBe(
      true,
    );
    expect(OutcomeReportSchema.safeParse({ outcome: "FAILED" }).success).toBe(
      true,
    );
  });

  it("rejects anything else", () => {
    expect(OutcomeReportSchema.safeParse({ outcome: "MAYBE" }).success).toBe(
      false,
    );
    expect(OutcomeReportSchema.safeParse({ outcome: null }).success).toBe(false);
    expect(OutcomeReportSchema.safeParse({}).success).toBe(false);
  });
});
