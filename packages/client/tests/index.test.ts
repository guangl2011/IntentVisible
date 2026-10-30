import { declareIntent, reportOutcome } from "../src/index.js";
import { describe, expect, it } from "vitest";

// The real client (typed errors, fetch stubbing, request-shape assertions)
// arrives with the client subtask; this locks in the placeholder contract.
describe("@intentvisible/client placeholder", () => {
  it("declareIntent rejects while unimplemented", async () => {
    await expect(
      declareIntent({ action: "deploy", target: "prod/api", risk: "HIGH" }),
    ).rejects.toThrow("declareIntent is not implemented yet");
  });

  it("reportOutcome rejects while unimplemented", async () => {
    await expect(reportOutcome("intent_1", { outcome: "SUCCEEDED" })).rejects.toThrow(
      "reportOutcome is not implemented yet",
    );
  });
});
