import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveQueue, Draft, SendOutcome, StorageLike } from './autosaveQueue';
import { ServerClock } from './serverClock';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('ServerClock', () => {
  it('tracks server time from the request midpoint and ignores the local wall clock', () => {
    let perf = 1000;
    const clock = new ServerClock(() => perf);
    clock.sample('2026-10-01T10:00:00.000Z', 900, 1000); // rtt 100ms
    expect(clock.now()).toBe(Date.parse('2026-10-01T10:00:00.050Z'));
    perf += 60_000;
    expect(clock.now()).toBe(Date.parse('2026-10-01T10:01:00.050Z'));
  });

  it('discards samples with much worse latency', () => {
    let perf = 0;
    const clock = new ServerClock(() => perf);
    clock.sample('2026-10-01T10:00:00.000Z', 0, 20);
    perf = 20;
    clock.sample('2026-10-01T11:00:00.000Z', 20, 5020); // 5s rtt — rejected
    expect(clock.now()).toBe(Date.parse('2026-10-01T10:00:00.010Z'));
  });
});

describe('AutosaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces, sends the latest selection with increasing seq, and clears drafts on success', async () => {
    const sent: [string, Draft][] = [];
    const q = new AutosaveQueue('a1', async (id, d) => (sent.push([id, d]), 'ok'), memoryStorage(), { debounceMs: 100 });
    q.set('q1', ['o1']);
    q.set('q1', ['o2']);
    expect(q.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toEqual([['q1', { selectedOptionIds: ['o2'], seq: 2 }]]);
    expect(q.pending).toBe(0);
    expect(q.status).toBe('saved');
  });

  it('keeps drafts across a failure and retries with backoff', async () => {
    const outcomes: SendOutcome[] = ['retry', 'retry', 'ok'];
    const transport = vi.fn(async () => outcomes.shift()!);
    const q = new AutosaveQueue('a1', transport, memoryStorage(), { debounceMs: 0, baseRetryMs: 1000 });
    q.set('q1', ['o1']);
    await vi.advanceTimersByTimeAsync(1);
    expect(q.status).toBe('retrying');
    expect(q.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(q.status).toBe('saved');
  });

  it('persists drafts so a reload can resume them, merging with the server copy by seq', () => {
    const storage = memoryStorage();
    const first = new AutosaveQueue('a1', async () => 'retry', storage);
    first.set('q1', ['local-new']); // seq 1
    first.set('q2', ['local-old']); // seq 2
    first.dispose();

    const second = new AutosaveQueue('a1', async () => 'ok', storage);
    const merged = second.hydrate([
      { questionVersionId: 'q1', selectedOptionIds: ['server'], seq: 0 },
      { questionVersionId: 'q2', selectedOptionIds: ['server-newer'], seq: 7 },
    ]);
    expect(merged.get('q1')).toEqual(['local-new']);
    expect(merged.get('q2')).toEqual(['server-newer']);
    expect(second.pending).toBe(1);
    second.set('q3', ['x']);
    expect(JSON.parse(storage.data.get('attempt:a1:drafts')!).q3.seq).toBe(8);
  });

  it('stops for good when the server reports the attempt closed', async () => {
    const transport = vi.fn(async () => 'closed' as const);
    const q = new AutosaveQueue('a1', transport, memoryStorage(), { debounceMs: 0 });
    q.set('q1', ['o1']);
    await vi.advanceTimersByTimeAsync(1);
    expect(q.status).toBe('closed');
    q.set('q2', ['o1']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('flushAndWait resolves once everything is saved', async () => {
    const q = new AutosaveQueue('a1', async () => 'ok', memoryStorage(), { debounceMs: 10_000 });
    q.set('q1', ['o1']);
    const done = q.flushAndWait(5000);
    await vi.advanceTimersByTimeAsync(1);
    await expect(done).resolves.toBe(true);
  });
});
