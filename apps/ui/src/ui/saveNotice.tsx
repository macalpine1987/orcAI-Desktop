import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

type SaveNoticeContextValue = {
  notifySaved: (message?: string) => void;
};

const SaveNoticeContext = createContext<SaveNoticeContextValue | null>(null);

export function SaveNoticeProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const notifySaved = useCallback(
    (customMessage?: string) => {
      setMessage(customMessage ?? t("common.saveSuccess"));
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setMessage(null), 3200);
    },
    [t],
  );

  return (
    <SaveNoticeContext.Provider value={{ notifySaved }}>
      {children}
      {message ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-3 z-[300] max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-accent/40 bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-lg ring-1 ring-accent/20"
        >
          {message}
        </div>
      ) : null}
    </SaveNoticeContext.Provider>
  );
}

export function useSaveNotice(): SaveNoticeContextValue {
  const ctx = useContext(SaveNoticeContext);
  if (!ctx) {
    throw new Error("useSaveNotice must be used within SaveNoticeProvider");
  }
  return ctx;
}
