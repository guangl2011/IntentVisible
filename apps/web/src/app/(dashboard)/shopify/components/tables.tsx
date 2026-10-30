import type { MappingListItem, ProductListItem } from "@intentvisible/client";

/** The synced catalog: every product, soft-deleted ones marked. */
export function ProductTable({ products }: { products: ProductListItem[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Product</th>
          <th>SKUs</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.product_id}>
            <td>
              <strong>{product.name}</strong>
              {product.description !== undefined && (
                <div className="muted product-desc">{product.description}</div>
              )}
            </td>
            <td>{product.skus.length}</td>
            <td>
              {product.deleted_at === null ? (
                <span className="badge badge-APPROVED">live</span>
              ) : (
                <span className="badge badge-DENIED">deleted</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** SKU ↔ intent mappings with landing URL and evidence links. */
export function MappingTable({ mappings }: { mappings: MappingListItem[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Intent</th>
          <th>SKU</th>
          <th>Match</th>
          <th>Landing URL</th>
          <th>Evidence</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {mappings.map((mapping) => (
          <tr key={mapping.mapping_id}>
            <td className="mono">{mapping.intent_id}</td>
            <td className="mono">{mapping.sku_id}</td>
            <td>{mapping.match_strength}</td>
            <td>
              <a href={mapping.landing_url} target="_blank" rel="noreferrer">
                {mapping.landing_url.replace(/^https?:\/\//, "").slice(0, 48)}
              </a>
            </td>
            <td>
              {mapping.evidence_urls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="evidence-link">
                  source
                </a>
              ))}
            </td>
            <td>
              {mapping.active ? (
                <span className="badge badge-APPROVED">active</span>
              ) : (
                <span className="badge badge-DENIED">invalidated</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
