import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown, useOnline } from './useCountdown';
import { serverClock } from './serverClock';

describe('useCountdown and useOnline hooks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when deadlineIso is undefined', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useCountdown(undefined, onExpire));
    expect(result.current).toBeNull();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('counts down to deadline and triggers onExpire once when reaching 0', () => {
    const now = Date.now();
    vi.spyOn(serverClock, 'now').mockImplementation(() => now);

    const onExpire = vi.fn();
    const deadlineIso = new Date(now + 1000).toISOString();

    const { result } = renderHook(() => useCountdown(deadlineIso, onExpire));
    expect(result.current).toBe(1000);

    // Advance by 500ms
    vi.spyOn(serverClock, 'now').mockImplementation(() => now + 500);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(500);
    expect(onExpire).not.toHaveBeenCalled();

    // Advance past deadline
    vi.spyOn(serverClock, 'now').mockImplementation(() => now + 1200);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Another tick does not fire onExpire again
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('useOnline responds to online and offline window events', () => {
    const { result } = renderHook(() => useOnline());
    expect(typeof result.current).toBe('boolean');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
