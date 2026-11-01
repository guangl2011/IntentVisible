/**
 * Generic data-state panels shared by every dashboard feature area (the
 * Shopify pages re-export them for compatibility). Loading matches the card
 * layout the data will fill; error renders an alert; empty explains and
 * calls to action — never a blank area.
 */

/** Loading state: skeleton matching the card layout the data will fill. */
export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="card" aria-busy="true" aria-label={`Loading ${label}`}>
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}

/** Error state for a failed data fetch. */
export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="card error-card" role="alert">
      <strong>Could not load data.</strong> {message}
    </div>
  );
}

/** Empty state: an explanation plus a call to action, never a blank area. */
export function EmptyPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card empty-card">
      <strong>{title}</strong>
      <p className="muted">{hint}</p>
    </div>
  );
}
