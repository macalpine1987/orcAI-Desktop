import { useCallback, useRef, useState } from "react";

/**
 * Sync busy gate so a second click before React re-renders cannot start
 * another in-flight action (same pattern as HomePage / TrainWizard).
 */
export function useBusyGuard() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const markBusy = useCallback((next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  }, []);

  const runBusy = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      if (busyRef.current) return false;
      markBusy(true);
      try {
        await fn();
        return true;
      } finally {
        markBusy(false);
      }
    },
    [markBusy],
  );

  return { busy, busyRef, markBusy, runBusy };
}
