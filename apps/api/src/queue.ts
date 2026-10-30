/**
 * The queue seam (spec Architecture decisions: queue with in-process test
 * fallback). The pipeline hands the API a `run` closure per job; a Redis /
 * BullMQ implementation later replaces InProcessQueue without touching the
 * routes or the pipeline.
 */

/**
 * Accepts job work for asynchronous execution. Implementations must not
 * throw from enqueue and must not lose an error: anything a closure
 * throws that it did not handle itself reaches the onError hook.
 */
export interface AnalyzeQueue {
  enqueue(work: () => Promise<void>): void;
  /** Resolves once nothing is queued or in flight — tests and shutdown. */
  drain(): Promise<void>;
}

export class InProcessQueue implements AnalyzeQueue {
  private readonly pending: Array<() => Promise<void>> = [];
  private inFlight = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly concurrency = 1,
    private readonly onError: (error: unknown) => void = (error) => {
      // The pipeline maps its own failures onto the job record; reaching
      // this hook means a bug escaped it. Never swallow it silently.
      console.error("queue task escaped pipeline error handling", error);
    },
  ) {}

  enqueue(work: () => Promise<void>): void {
    this.pending.push(work);
    void this.pump();
  }

  async drain(): Promise<void> {
    while (this.pending.length > 0 || this.inFlight > 0) {
      await new Promise<void>((resolve) => {
        this.idleWaiters.push(resolve);
        setImmediate(resolve);
      });
    }
  }

  private async pump(): Promise<void> {
    if (this.inFlight >= this.concurrency) {
      return;
    }
    const work = this.pending.shift();
    if (!work) {
      return;
    }
    this.inFlight += 1;
    try {
      await work();
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight -= 1;
      if (this.pending.length > 0) {
        void this.pump();
      }
      this.releaseWaiters();
    }
  }

  private releaseWaiters(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }
}
