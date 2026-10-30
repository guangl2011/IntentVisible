"use client";

import { useEffect, useState } from "react";

import type { ShopifyClient, ShopifyJob } from "@intentvisible/client";

const TERMINAL_STATUSES = new Set(["complete", "failed"]);
const POLL_MS = 1000;

/**
 * Polls a started job until it reaches a terminal status, then clears the
 * tracked id and lets the caller refresh its data. The poll stops on
 * unmount or when the job id is cleared; failures land in `job`.
 */
export function useJobPoll(
  client: ShopifyClient,
  onTerminal: () => void,
): {
  /** The job being polled (updated live), null when idle. */
  job: ShopifyJob | null;
  /** Start polling a job returned by a trigger call. */
  trackJob: (jobId: string) => void;
  /** Stop polling and drop the live job state. */
  reset: () => void;
} {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ShopifyJob | null>(null);

  useEffect(() => {
    if (jobId === null) return;
    let stopped = false;
    const tick = async () => {
      try {
        const next = await client.job(jobId);
        if (stopped) return;
        setJob(next);
        if (TERMINAL_STATUSES.has(next.status)) {
          setJobId(null);
          onTerminal();
        }
      } catch {
        // A single failed poll is transient (dev server restart, network
        // blip); keep polling. A dead API surfaces in the page's own
        // reads as its error state.
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // onTerminal is intentionally excluded from deps: callers pass inline
    // closures that would re-arm the poll on every render. The dep set
    // that matters (jobId, client) is complete.
  }, [jobId, client]);

  return {
    job,
    trackJob: (next: string) => {
      setJob(null);
      setJobId(next);
    },
    reset: () => {
      setJobId(null);
      setJob(null);
    },
  };
}
