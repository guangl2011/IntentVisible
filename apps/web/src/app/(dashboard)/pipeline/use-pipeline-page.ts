"use client";

import { useCallback, useEffect, useState } from "react";

import { loadBinding as readBinding, type PipelineBinding } from "../../../lib/pipeline/binding";
import type { LoadResult } from "../../../lib/pipeline/load";

/**
 * Shared page data path for the pipeline read pages: hydrate the binding
 * from localStorage, run the caller's loader against the bound project,
 * expose a reload for post-action refreshes. The loader identity is the
 * caller's concern (useCallback at the call site or a module function).
 */

export function usePipelinePage<T>(load: (projectId: string) => Promise<LoadResult<T>>): {
  hydrated: boolean;
  binding: PipelineBinding | null;
  result: LoadResult<T> | null;
  reload: () => void;
} {
  const [binding, setBinding] = useState<PipelineBinding | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<LoadResult<T> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setBinding(readBinding());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (binding === null) return;
    let cancelled = false;
    void load(binding.projectId).then((loaded) => {
      if (!cancelled) setResult(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [binding, tick, load]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { hydrated, binding, result, reload };
}
