"use client";

import { SKU_MAPPINGS } from "../../../../lib/plugin/demo-fixtures";
import { BlindSpotFooter, SimulatedLabel } from "../components/red-lines";

/**
 * Products & SKUs (design v1.4 §2.3): SKU ↔ intent many-to-many mapping,
 * inventory linkage, and the match-eligibility switch shared with
 * Intent Match.
 */
export default function ProductsPage() {
  return (
    <>
      <h1>Products &amp; SKUs</h1>
      <p className="muted">
        Which SKUs are eligible to match which intents, and how inventory interacts with matching — the same
        eligibility data Intent Match consults when scoring requests.
      </p>
      <SimulatedLabel what="SKU mappings (fixture)" />
      <table className="table" data-testid="sku-mapping-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Mapped intent</th>
            <th>Inventory</th>
            <th>Match-eligible</th>
          </tr>
        </thead>
        <tbody>
          {SKU_MAPPINGS.map((mapping) => (
            <tr key={mapping.sku}>
              <td className="mono">{mapping.sku}</td>
              <td>{mapping.product}</td>
              <td>
                {mapping.intentName} <span className="muted">({mapping.intentId})</span>
              </td>
              <td>
                <span className={`badge ${mapping.inventoryState === "in stock" ? "badge-APPROVED" : "badge-PENDING_APPROVAL"}`}>
                  {mapping.inventoryState}
                </span>
              </td>
              <td>
                {mapping.eligible ? (
                  <span className="badge badge-APPROVED">eligible</span>
                ) : (
                  <span className="badge badge-DENIED">excluded</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Intent ↔ SKU mapping is many-to-many: one SKU can carry several intents and one intent can be
        matched by several SKUs. Low stock is surfaced to catch search-vs-inventory conflicts early.
      </p>
      <BlindSpotFooter
        items={[
          "The mapping rows are a labeled fixture — the live catalog sync renders in the dashboard's Shopify pages.",
          "Eligibility toggles are read-only here until the mapping writer ships.",
        ]}
      />
    </>
  );
}
