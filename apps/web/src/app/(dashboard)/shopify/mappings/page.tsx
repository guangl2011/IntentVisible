"use client";

import { useCallback, useEffect, useState } from "react";

import type { MappingListItem } from "@intentvisible/client";

import { loadBinding, type StoreBinding } from "../../../../lib/shopify/binding";
import { getShopifyClient } from "../../../../lib/shopify/client";
import { loadPage } from "../../../../lib/shopify/loaders";
import { ConnectCard } from "../components/connect-card";
import { EmptyPanel, ErrorPanel, LoadingPanel, ShopifyNav } from "../components/panels";
import { MappingTable } from "../components/tables";

type MappingsState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "loaded"; mappings: MappingListItem[] };

/**
 * Merchant mappings (spec D4): every SKU ↔ intent linkage with its
 * landing URL and evidence links. Read-only — invalidation is driven by
 * re-sync on the API side.
 */
export default function ShopifyMappingsPage() {
  const [binding, setBinding] = useState<StoreBinding | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<MappingsState>({ phase: "loading" });

  useEffect(() => {
    setBinding(loadBinding());
    setHydrated(true);
  }, []);

  const reload = useCallback(async (bound: StoreBinding) => {
    const mappings = await loadPage(() => getShopifyClient().listMappings(bound.storeId));
    if (!mappings.ok) {
      setState({ phase: "error", message: mappings.error.message });
      return;
    }
    setState({ phase: "loaded", mappings: mappings.data.mappings });
  }, []);

  useEffect(() => {
    if (binding !== null) void reload(binding);
  }, [binding, reload]);

  if (!hydrated || binding === null) {
    return (
      <>
        <ShopifyNav active="mappings" />
        {hydrated ? (
          <ConnectCard
            onSubmit={() => undefined}
            busy={false}
            error="Connect your store on the overview page first."
          />
        ) : (
          <LoadingPanel label="store binding" />
        )}
      </>
    );
  }

  return (
    <>
      <ShopifyNav active="mappings" />
      <h1 className="page-title">SKU mappings</h1>
      {state.phase === "loading" && <LoadingPanel label="mappings" />}
      {state.phase === "error" && <ErrorPanel message={state.message} />}
      {state.phase === "loaded" &&
        (state.mappings.length === 0 ? (
          <EmptyPanel
            title="No mappings yet"
            hint="Mappings link intents to SKUs — sync your catalog and regenerate intents to create them."
          />
        ) : (
          <MappingTable mappings={state.mappings} />
        ))}
    </>
  );
}
