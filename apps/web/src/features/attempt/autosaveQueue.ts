/**
 * Offline-tolerant autosave for one attempt.
 *
 * - Every change gets a monotonically increasing `seq`; the server only applies newer seqs,
 *   so retries and out-of-order deliveries can never overwrite a newer answer.
 * - Unsent drafts are persisted in localStorage, so closing the tab or losing the network
 *   loses nothing; on reload, drafts newer than the server copy are merged and re-sent.
 * - At most one request per question is in flight; failures retry with exponential backoff.
 */
export type SendOutcome = 'ok' | 'stale' | 'closed' | 'retry' | 'reject';

export type Transport = (questionVersionId: string, draft: Draft) => Promise<SendOutcome>;

export interface Draft {
  selectedOptionIds: string[];
  seq: number;
}

export type QueueStatus = 'saved' | 'saving' | 'retrying' | 'closed';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface QueueOptions {
  debounceMs?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
}

export class AutosaveQueue {
  private drafts = new Map<string, Draft>();
  private inFlight = new Set<string>();
  private seq = 0;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private retrying = false;
  private listeners = new Set<(s: QueueStatus) => void>();
  private idleWaiters: (() => void)[] = [];
  private readonly opts: Required<QueueOptions>;

  constructor(
    private readonly attemptId: string,
    private readonly transport: Transport,
    private readonly storage: StorageLike = safeLocalStorage(),
    opts: QueueOptions = {},
  ) {
    this.opts = { debounceMs: 250, baseRetryMs: 1000, maxRetryMs: 30_000, ...opts };
    this.seq = Number(this.storage.getItem(this.key('seq')) ?? 0) || 0;
    try {
      const raw = this.storage.getItem(this.key('drafts'));
      if (raw) for (const [q, d] of Object.entries(JSON.parse(raw) as Record<string, Draft>)) this.drafts.set(q, d);
    } catch {
      /* corrupted storage: start clean */
    }
  }

  /**
   * Merge server state with local drafts. Returns the selection per question that the UI should
   * show: the local draft when it is newer than what the server has, otherwise the server copy.
   */
  hydrate(server: { questionVersionId: string; selectedOptionIds: string[]; seq: number }[]): Map<string, string[]> {
    const merged = new Map<string, string[]>();
    for (const a of server) {
      merged.set(a.questionVersionId, a.selectedOptionIds);
      this.seq = Math.max(this.seq, a.seq);
      const draft = this.drafts.get(a.questionVersionId);
      if (draft && draft.seq <= a.seq) this.drafts.delete(a.questionVersionId);
    }
    for (const [q, d] of this.drafts) {
      merged.set(q, d.selectedOptionIds);
      this.seq = Math.max(this.seq, d.seq);
    }
    this.persist();
    if (this.drafts.size) this.schedule(0);
    this.emit();
    return merged;
  }

  set(questionVersionId: string, selectedOptionIds: string[]): void {
    if (this.closed) return;
    this.drafts.set(questionVersionId, { selectedOptionIds, seq: ++this.seq });
    this.persist();
    this.emit();
    this.schedule(this.retrying ? this.backoff() : this.opts.debounceMs);
  }

  get pending(): number {
    return this.drafts.size;
  }

  get status(): QueueStatus {
    if (this.closed) return 'closed';
    if (this.retrying) return 'retrying';
    return this.drafts.size || this.inFlight.size ? 'saving' : 'saved';
  }

  subscribe(fn: (s: QueueStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Try to send everything now; resolves true when nothing is pending (or false on timeout). */
  async flushAndWait(timeoutMs: number): Promise<boolean> {
    if (this.pending === 0 && this.inFlight.size === 0) return true;
    this.failures = 0;
    this.retrying = false;
    void this.flush();
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(this.pending === 0), timeoutMs);
      this.idleWaiters.push(() => {
        clearTimeout(t);
        resolve(true);
      });
    });
  }

  /** Server says the attempt is over: stop sending and forget drafts. */
  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.drafts.clear();
    this.storage.removeItem(this.key('drafts'));
    this.emit();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }

  /** Called when the browser comes back online. */
  nudge(): void {
    if (this.drafts.size && !this.closed) {
      this.failures = 0;
      this.schedule(0);
    }
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const batch = [...this.drafts.entries()].filter(([q]) => !this.inFlight.has(q));
    await Promise.all(batch.map(([q, d]) => this.sendOne(q, d)));
    if (this.closed) return;
    if (this.drafts.size === 0 && this.inFlight.size === 0) {
      this.failures = 0;
      this.retrying = false;
      this.idleWaiters.splice(0).forEach((w) => w());
    } else if (this.retrying) {
      this.schedule(this.backoff());
    } else if ([...this.drafts.keys()].some((q) => !this.inFlight.has(q))) {
      this.schedule(0);
    }
    this.emit();
  }

  private async sendOne(q: string, draft: Draft): Promise<void> {
    this.inFlight.add(q);
    this.emit();
    let outcome: SendOutcome;
    try {
      outcome = await this.transport(q, draft);
    } catch {
      outcome = 'retry';
    }
    this.inFlight.delete(q);
    switch (outcome) {
      case 'ok':
      case 'stale': // the server already holds something newer
      case 'reject': // invalid payload; retrying would never succeed
        if (this.drafts.get(q)?.seq === draft.seq) this.drafts.delete(q);
        this.failures = 0;
        this.retrying = false;
        this.persist();
        break;
      case 'closed':
        this.close();
        break;
      case 'retry':
        this.failures++;
        this.retrying = true;
        break;
    }
  }

  private backoff(): number {
    const exp = this.opts.baseRetryMs * 2 ** Math.max(0, this.failures - 1);
    return Math.min(this.opts.maxRetryMs, exp) * (0.8 + Math.random() * 0.4);
  }

  private schedule(delay: number): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  private persist(): void {
    try {
      this.storage.setItem(this.key('seq'), String(this.seq));
      if (this.drafts.size) this.storage.setItem(this.key('drafts'), JSON.stringify(Object.fromEntries(this.drafts)));
      else this.storage.removeItem(this.key('drafts'));
    } catch {
      /* storage full or blocked: in-memory queue still works */
    }
  }

  private emit(): void {
    const s = this.status;
    this.listeners.forEach((fn) => fn(s));
  }

  private key(name: string): string {
    return `attempt:${this.attemptId}:${name}`;
  }
}

function safeLocalStorage(): StorageLike {
  try {
    const k = '__probe__';
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}
