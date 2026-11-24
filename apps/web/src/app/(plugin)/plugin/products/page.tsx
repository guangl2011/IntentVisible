"use client";

import { SKU_MAPPINGS } from "../../../../lib/plugin/demo-fixtures";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter, SimulatedLabel } from "../components/red-lines";

/**
 * Products & SKUs (design v1.4 §2.3): SKU ↔ intent many-to-many mapping,
 * inventory linkage, and the match-eligibility switch shared with
 * Intent Match.
 */
export default function ProductsPage() {
  const t = useT();
  return (
    <>
      <h1>{t.products.title}</h1>
      <p className="muted">{t.products.intro}</p>
      <SimulatedLabel what={t.simLabels.skuMappings} />
      <table className="table" data-testid="sku-mapping-table">
        <thead>
          <tr>
            <th>{t.products.headers.sku}</th>
            <th>{t.products.headers.product}</th>
            <th>{t.products.headers.intent}</th>
            <th>{t.products.headers.inventory}</th>
            <th>{t.products.headers.eligible}</th>
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
                  {mapping.inventoryState === "in stock" ? t.products.inStock : t.products.lowStock}
                </span>
              </td>
              <td>
                {mapping.eligible ? (
                  <span className="badge badge-APPROVED">{t.products.eligibleBadge}</span>
                ) : (
                  <span className="badge badge-DENIED">{t.products.excludedBadge}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t.products.manyToManyNote}</p>
      <BlindSpotFooter items={t.blindSpots.products} />
    </>
  );
}
