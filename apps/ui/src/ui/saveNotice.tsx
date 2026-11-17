import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { HeaderNoticeChip } from "../components/HeaderNoticeChip";

export type HeaderNoticeKind = "info" | "tip" | "error";

export type HeaderTipSource = "data-health" | "snippets";

export type HeaderTipNotice = {
  message: string;
  actionLabel?: string;
  actionTo?: string;
  onDismiss?: () => void;
};

type SaveNoticeContextValue = {
  notifySaved: (message?: string) => void;
  notifyHeaderError: (message: string) => void;
  /** Sticky tip slot by source (data-health / pipeline snippets). */
  setHeaderTip: (source: HeaderTipSource, tip: HeaderTipNotice | null) => void;
  headerError: string | null;
  dismissHeaderError: () => void;
  activeNotice: {
    kind: HeaderNoticeKind;
    message: string;
    dismissible: boolean;
    actionLabel?: string;
    actionTo?: string;
    onDismiss?: () => void;
  } | null;
};

const SaveNoticeContext = createContext<SaveNoticeContextValue | null>(null);

const TIP_PRIORITY: HeaderTipSource[] = ["snippets", "data-health"];

export function SaveNoticeProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [tips, setTips] = useState<
    Partial<Record<HeaderTipSource, HeaderTipNotice>>
  >({});
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const notifySaved = useCallback(
    (customMessage?: string) => {
      setInfoMessage(customMessage ?? t("common.saveSuccess"));
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setInfoMessage(null), 3200);
    },
    [t],
  );

  const notifyHeaderError = useCallback((next: string) => {
    const text = next.trim();
    if (text) setHeaderError(text);
  }, []);

  const dismissHeaderError = useCallback(() => {
    setHeaderError(null);
  }, []);

  const setHeaderTip = useCallback(
    (source: HeaderTipSource, tip: HeaderTipNotice | null) => {
      setTips((prev) => {
        if (tip == null) {
          if (!(source in prev)) return prev;
          const next = { ...prev };
          delete next[source];
          return next;
        }
        return { ...prev, [source]: tip };
      });
    },
    [],
  );

  const activeTip = useMemo(() => {
    for (const source of TIP_PRIORITY) {
      const tip = tips[source];
      if (tip) return { source, tip };
    }
    return null;
  }, [tips]);

  const activeNotice = useMemo(() => {
    if (headerError) {
      return {
        kind: "error" as const,
        message: headerError,
        dismissible: true,
        onDismiss: dismissHeaderError,
      };
    }
    if (infoMessage) {
      return {
        kind: "info" as const,
        message: infoMessage,
        dismissible: false,
      };
    }
    if (activeTip) {
      const { source, tip } = activeTip;
      return {
        kind: "tip" as const,
        message: tip.message,
        dismissible: true,
        actionLabel: tip.actionLabel,
        actionTo: tip.actionTo,
        onDismiss: () => {
          tip.onDismiss?.();
          setHeaderTip(source, null);
        },
      };
    }
    return null;
  }, [activeTip, dismissHeaderError, headerError, infoMessage, setHeaderTip]);

  const value = useMemo(
    () => ({
      notifySaved,
      notifyHeaderError,
      setHeaderTip,
      headerError,
      dismissHeaderError,
      activeNotice,
    }),
    [
      activeNotice,
      dismissHeaderError,
      headerError,
      notifyHeaderError,
      notifySaved,
      setHeaderTip,
    ],
  );

  return (
    <SaveNoticeContext.Provider value={value}>
      {children}
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

/** Header error line. Outside the provider this is a no-op. */
export function useHeaderError(): {
  headerError: string | null;
  dismissHeaderError: () => void;
} {
  const ctx = useContext(SaveNoticeContext);
  return {
    headerError: ctx?.headerError ?? null,
    dismissHeaderError: ctx?.dismissHeaderError ?? (() => undefined),
  };
}

export function useHeaderNoticeSlot(): {
  activeNotice: SaveNoticeContextValue["activeNotice"];
} {
  const ctx = useContext(SaveNoticeContext);
  return { activeNotice: ctx?.activeNotice ?? null };
}

/** Renders the active header chip (call from AppShell header). */
export function HeaderNoticeSlot() {
  const { activeNotice } = useHeaderNoticeSlot();
  if (!activeNotice) return null;
  return (
    <div className="mat-shell-header-notice">
      <HeaderNoticeChip
        kind={activeNotice.kind}
        message={activeNotice.message}
        dismissible={activeNotice.dismissible}
        actionLabel={activeNotice.actionLabel}
        actionTo={activeNotice.actionTo}
        onDismiss={activeNotice.onDismiss}
      />
    </div>
  );
}
