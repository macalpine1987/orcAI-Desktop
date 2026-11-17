import { useEffect, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMainShellWindow } from "../platform/shellWindow";
import { silentCatch } from "../lib/silentCatch";

type Options = {
  stopAll: () => Promise<void>;
  onlineRef: MutableRefObject<boolean>;
  userStartedRuntimeRef: MutableRefObject<boolean>;
};

/**
 * Main Lab shell only: hide-on-close vs stop_and_close (Quit still hits Rust Exit).
 * Child windows close themselves without stopping sidecar.
 */
export function useMainShellClosePolicy(options: Options): void {
  const { stopAll, onlineRef, userStartedRuntimeRef } = options;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      if (!isMainShellWindow()) return;

      let closePolicy = "stop_and_close";
      try {
        closePolicy = await invoke<string>("window_close_policy");
      } catch (err) {
        silentCatch("runtimeLifecycle")(err);
      }
      if (cancelled) return;
      try {
        unlisten = await getCurrentWindow().onCloseRequested((event) => {
          if (closePolicy === "hide") {
            event.preventDefault();
            void getCurrentWindow().hide().catch(silentCatch("runtimeLifecycle"));
            return;
          }

          if (!userStartedRuntimeRef.current && !onlineRef.current) {
            return;
          }
          event.preventDefault();
          void (async () => {
            try {
              await stopAll();
            } catch (err) {
              silentCatch("runtimeLifecycle")(err);
            }
            try {
              await getCurrentWindow().destroy();
            } catch (err) {
              silentCatch("runtimeLifecycle")(err);
              await getCurrentWindow().close();
            }
          })();
        });
      } catch (err) {
        silentCatch("runtimeLifecycle")(err);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onlineRef, stopAll, userStartedRuntimeRef]);
}
