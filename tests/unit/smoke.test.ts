import { describe, expect, it } from "vitest";

// Scaffold smoke test: proves the Vitest pipeline runs and that the workspace
// package is resolvable. Replaced by the policy-engine tests in the next task.
describe("scaffold", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
