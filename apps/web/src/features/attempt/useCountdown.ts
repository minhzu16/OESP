import { useEffect, useRef, useState } from 'react';
import { serverClock } from './serverClock';

/**
 * Remaining milliseconds until `deadlineIso`, measured on the estimated server clock.
 * Calls `onExpire` once when it reaches zero. Purely cosmetic — the server enforces the deadline.
 */
export function useCountdown(deadlineIso: string | undefined, onExpire: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!deadlineIso) return;
    fired.current = false;
    const deadline = Date.parse(deadlineIso);
    const tick = () => {
      const left = Math.max(0, deadline - serverClock.now());
      setRemaining(left);
      if (left === 0 && !fired.current) {
        fired.current = true;
        expireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return remaining;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
