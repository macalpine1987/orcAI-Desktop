import { useCallback, useEffect, useState } from "react";
import {
  CLEARED_ACTIVE_PROJECT_EVENT,
  dismissClearedActiveProjectNotice,
  peekClearedActiveProjectNotice,
  type ClearedActiveProjectNotice,
} from "../workspace/clearedActiveProjectNotice";

export function useClearedActiveProjectNotice(): {
  notice: ClearedActiveProjectNotice | null;
  dismiss: () => void;
} {
  const [notice, setNotice] = useState<ClearedActiveProjectNotice | null>(() =>
    peekClearedActiveProjectNotice(),
  );

  useEffect(() => {
    const sync = () => setNotice(peekClearedActiveProjectNotice());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<ClearedActiveProjectNotice | null>).detail;
      setNotice(detail ?? null);
    };
    window.addEventListener(CLEARED_ACTIVE_PROJECT_EVENT, onCustom);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(CLEARED_ACTIVE_PROJECT_EVENT, onCustom);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const dismiss = useCallback(() => {
    dismissClearedActiveProjectNotice();
    setNotice(null);
  }, []);

  return { notice, dismiss };
}
