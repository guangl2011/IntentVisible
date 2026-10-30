"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 15s polling for the queue only (spec: no websockets in v1). Server
 * components re-render on router.refresh(); nothing else in the dashboard
 * polls.
 */
export function QueueRefresher({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
