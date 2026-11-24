"use client";

import { useCallback, useEffect, useState } from "react";

import { loadShopBinding } from "../../../lib/plugin/binding";
import type { LoadResult } from "../../../lib/plugin/load";

/**
 * Shared page data path for the plugin read pages: resolve the shop
 * binding (defaulting to the demo shop when none is stored — test
 * dashboard design), run the caller's loader, expose a reload. Same
 * contract as the pipeline pages' usePipelinePage.
 */
export function usePluginPage<T>(load: (shopId: string) => Promise<LoadResult<T>>): {
  binding: { shopId: string; shopDomain: string } | null;
  result: LoadResult<T> | null;
  reload: () => void;
} {
  const [binding, setBinding] = useState<{ shopId: string; shopDomain: string } | null>(null);
  const [result, setResult] = useState<LoadResult<T> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setBinding(loadShopBinding());
  }, []);

  useEffect(() => {
    if (binding === null) return;
    let cancelled = false;
    void load(binding.shopId).then((loaded) => {
      if (!cancelled) setResult(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [binding, tick, load]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { binding, result, reload };
}
