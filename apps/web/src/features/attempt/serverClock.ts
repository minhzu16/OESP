/**
 * Estimates the server's clock from response timestamps (NTP-style midpoint), anchored on the
 * monotonic `performance.now()`. Changing the computer's clock therefore has no effect on the
 * countdown — the client only *displays* time; the server enforces it.
 */
export class ServerClock {
  private anchorServerMs: number | null = null;
  private anchorPerfMs = 0;
  private bestRttMs = Number.POSITIVE_INFINITY;

  constructor(private readonly perfNow: () => number = () => performance.now()) {}

  /**
   * @param serverTimeIso server timestamp contained in the response
   * @param sentPerf performance.now() when the request was sent
   * @param receivedPerf performance.now() when the response arrived
   */
  sample(serverTimeIso: string, sentPerf: number, receivedPerf: number): void {
    const serverMs = Date.parse(serverTimeIso);
    if (Number.isNaN(serverMs)) return;
    const rtt = Math.max(0, receivedPerf - sentPerf);
    // Prefer low-latency samples; accept slightly worse ones so the estimate keeps refreshing.
    if (this.anchorServerMs !== null && rtt > this.bestRttMs * 2 + 50) return;
    this.bestRttMs = Math.min(this.bestRttMs, rtt);
    this.anchorServerMs = serverMs + rtt / 2;
    this.anchorPerfMs = receivedPerf;
  }

  get synced(): boolean {
    return this.anchorServerMs !== null;
  }

  /** Current server time in epoch ms (falls back to the local clock before the first sample). */
  now(): number {
    if (this.anchorServerMs === null) return Date.now();
    return this.anchorServerMs + (this.perfNow() - this.anchorPerfMs);
  }

  /** Estimated server − local offset, for display/debugging. */
  offsetMs(): number {
    return this.now() - Date.now();
  }
}

export const serverClock = new ServerClock();
