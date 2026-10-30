import { describe, expect, it } from "vitest";

import {
  LEAST_PRIVILEGE_SCOPE_PARAM,
  LEAST_PRIVILEGE_SCOPES,
  leastPrivilegeViolations,
  missingLeastPrivilegeScopes,
  parseGrantedScopes,
} from "../src/scopes.js";

describe("least-privilege scope contract", () => {
  it("locks exactly the two approved scopes", () => {
    expect([...LEAST_PRIVILEGE_SCOPES]).toEqual([
      "read_products",
      "read_online_store_pages",
    ]);
    expect(LEAST_PRIVILEGE_SCOPE_PARAM).toBe(
      "read_products,read_online_store_pages",
    );
  });

  it("parses the exchange response's scope field", () => {
    expect(parseGrantedScopes("read_products,read_online_store_pages")).toEqual([
      "read_products",
      "read_online_store_pages",
    ]);
    expect(parseGrantedScopes("read_products, read_online_store_pages")).toEqual([
      "read_products",
      "read_online_store_pages",
    ]);
    expect(parseGrantedScopes("")).toEqual([]);
  });

  it("flags grants beyond the locked set", () => {
    expect(leastPrivilegeViolations(["read_products", "read_online_store_pages"])).toEqual([]);
    expect(leastPrivilegeViolations(["read_products", "write_products"])).toEqual([
      "write_products",
    ]);
    expect(leastPrivilegeViolations([])).toEqual([]);
  });

  it("flags locked scopes the store did not grant", () => {
    expect(missingLeastPrivilegeScopes(["read_products", "read_online_store_pages"])).toEqual([]);
    expect(missingLeastPrivilegeScopes(["read_products"])).toEqual([
      "read_online_store_pages",
    ]);
  });
});
