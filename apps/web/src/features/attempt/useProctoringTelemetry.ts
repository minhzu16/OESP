import { useEffect } from 'react';
import { post } from '../../api/client';

/**
 * Proctoring telemetry hook: detects tab switch, window blur, and copy/paste attempts
 * while an attempt is in progress, throttled to at most one event every 2 seconds.
 */
export function useProctoringTelemetry(attemptId: string, active: boolean): void {
  useEffect(() => {
    if (!attemptId || !active) return;

    let lastSent = 0;
    const sendTelemetry = (
      eventType: 'TAB_SWITCH' | 'WINDOW_BLUR' | 'COPY_PASTE_ATTEMPT' | 'FULLSCREEN_EXIT',
      details?: string,
    ) => {
      const now = Date.now();
      if (now - lastSent < 2000) return;
      lastSent = now;
      post(`/attempts/${attemptId}/telemetry`, {
        eventType,
        details,
        clientTimestamp: now,
      }).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendTelemetry('TAB_SWITCH', 'Student switched tab or minimized browser window');
      }
    };

    const handleBlur = () => {
      sendTelemetry('WINDOW_BLUR', 'Browser window lost focus');
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      sendTelemetry('COPY_PASTE_ATTEMPT', `Clipboard ${e.type} event intercepted`);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('copy', handleCopyPaste);
    window.addEventListener('paste', handleCopyPaste);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('copy', handleCopyPaste);
      window.removeEventListener('paste', handleCopyPaste);
    };
  }, [attemptId, active]);
}
