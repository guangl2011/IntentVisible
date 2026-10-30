import { describe, expect, it } from "vitest";

import * as pkg from "./index.js";

describe("intent-importer", () => {
  it("exports its public surface", () => {
    const exported = Object.values(pkg);
    expect(exported.length).toBeGreaterThan(0);
    expect(exported.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
  });
});
