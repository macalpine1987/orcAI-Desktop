import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isTauri } from "../platform/tauri";
import {
  SHELL_NAVIGATE_EVENT,
  type ShellNavigatePayload,
} from "../platform/shellNavigate";
import { isMainShellWindow } from "../platform/shellWindow";

/** Main window only: react to ``SHELL_NAVIGATE_EVENT`` from train-monitor Help, etc. */
export function useShellNavigateListener(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri() || !isMainShellWindow()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      return listen<ShellNavigatePayload>(SHELL_NAVIGATE_EVENT, (event) => {
        const path = event.payload?.path?.trim();
        if (!path || !path.startsWith("/")) return;
        navigate(path);
      }).then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      });
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);
}
