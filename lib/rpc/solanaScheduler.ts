const REQUEST_SPACING_MS = Math.ceil(1_000 / 3);
const MAX_IN_FLIGHT = 2;
const MAX_QUEUE_WAIT_MS = 15_000;

interface QueuedRequest {
  urls: readonly string[];
  start: (endpoint: string) => void;
}

/** One budget for all Solana HTTP connections in this JS runtime, including failover. */
export class SolanaRpcScheduler {
  private queue: QueuedRequest[] = [];
  private active = 0;
  private nextStart = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private providers = new Map<string, { until: number; failures: number }>();

  run<T>(
    urls: readonly string[],
    signal: AbortSignal | null | undefined,
    execute: (endpoint: string) => Promise<T>
  ): Promise<T> {
    signal?.throwIfAborted();
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const remove = () => {
      this.queue = this.queue.filter((entry) => entry !== entryForRequest);
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      remove();
      reject(signal?.reason);
      this.pump();
    };
    const entryForRequest: QueuedRequest = {
      urls,
      start: (endpoint) => {
        remove();
        void (async () => {
          try {
            resolve(await execute(endpoint));
          } catch (error) {
            reject(error);
          } finally {
            this.active -= 1;
            this.pump();
          }
        })();
      },
    };
    const timeout = setTimeout(() => {
      remove();
      reject(new Error("Solana RPC providers are busy. Please retry shortly."));
      this.pump();
    }, MAX_QUEUE_WAIT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    this.queue.push(entryForRequest);
    this.pump();
    return promise;
  }

  failed(endpoint: string, retryAfter: string | null = null, minimumDelayMs = 1_000) {
    const now = Date.now();
    const previous = this.providers.get(endpoint);
    const failures = Math.min((previous?.failures ?? 0) + 1, 7);
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const retryAt = Number.isFinite(seconds)
      ? now + Math.max(0, seconds) * 1_000
      : Date.parse(retryAfter ?? "");
    const backoff = Math.min(60_000, minimumDelayMs * 2 ** (failures - 1));
    this.providers.set(endpoint, {
      until: Math.max(previous?.until ?? 0, Number.isFinite(retryAt) ? retryAt : 0,
        now + backoff + Math.floor(Math.random() * 250)),
      failures,
    });
  }

  succeeded(endpoint: string) {
    // An older successful request must not erase a concurrent request's cooldown.
    if ((this.providers.get(endpoint)?.until ?? 0) <= Date.now()) {
      this.providers.delete(endpoint);
    }
  }

  private pump() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.queue.length || this.active >= MAX_IN_FLIGHT) return;
    const now = Date.now();
    let earliest = Infinity;
    for (const entry of this.queue) {
      for (const endpoint of entry.urls) {
        const readyAt = Math.max(this.nextStart, this.providers.get(endpoint)?.until ?? 0);
        if (readyAt <= now) {
          this.active += 1;
          this.nextStart = now + REQUEST_SPACING_MS;
          entry.start(endpoint);
          // Schedule the next start even when the current request is still running.
          this.pump();
          return;
        }
        earliest = Math.min(earliest, readyAt);
      }
    }
    if (Number.isFinite(earliest)) {
      this.timer = setTimeout(() => this.pump(), Math.max(0, earliest - now));
    }
  }
}

export const solanaRpcScheduler = new SolanaRpcScheduler();
