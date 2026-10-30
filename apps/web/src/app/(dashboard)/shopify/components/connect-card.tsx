"use client";

import { useState } from "react";

/**
 * The connect card: takes a myshopify domain (starts the install) or a
 * store id (re-binds). All API calls happen in the caller's onSubmit —
 * this component is presentational plus local input state.
 */
export function ConnectCard({
  onSubmit,
  busy,
  error,
  title = "Connect your Shopify store",
  hint = "Enter your store’s {slug}.myshopify.com domain to install IntentVisible, or paste a store id to re-open an existing connection.",
}: {
  onSubmit: (input: string) => void;
  busy: boolean;
  error: string | null;
  title?: string;
  hint?: string;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="card connect-card">
      <h2 className="page-title">{title}</h2>
      <p className="muted">{hint}</p>
      <form
        className="connect-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit(value);
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="acme-fixtures.myshopify.com"
          aria-label="Shopify store domain or store id"
        />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
