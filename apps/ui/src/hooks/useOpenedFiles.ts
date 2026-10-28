import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isRuntimeFreePath } from "../lib/appAccess";
import { resolveOpenFilePath } from "../platform/openFile";
import { isTauri } from "../platform/tauri";
import { useSidecarStatus } from "./useSidecarStatus";

function openPaths(
  paths: string[],
  navigate: ReturnType<typeof useNavigate>,
  seen: Set<string>,
  sectionsAccessible: boolean,
  deferred: string[],
) {
  let lastNavigated: { route: string; state: Record<string, string> } | null = null;
  for (const raw of paths) {
    const path = raw.trim();
    if (!path || seen.has(path)) continue;

    const target = resolveOpenFilePath(path);
    if (!target) continue;

    if (!sectionsAccessible && !isRuntimeFreePath(target.route)) {
      deferred.push(path);
      continue;
    }

    seen.add(path);
    lastNavigated = { route: target.route, state: target.state };
  }
  if (lastNavigated) {
    navigate(lastNavigated.route, { state: lastNavigated.state });
  }
}

/** Handle files opened from the OS (double-click, Open With, drag to dock icon). */
export function useOpenedFiles() {
  const navigate = useNavigate();
  const { sectionsAccessible } = useSidecarStatus();
  const seenRef = useRef(new Set<string>());
  const deferredRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    const flushDeferred = () => {
      if (!sectionsAccessible || !deferredRef.current.length) return;
      const batch = [...deferredRef.current];
      deferredRef.current = [];
      openPaths(batch, navigate, seenRef.current, sectionsAccessible, deferredRef.current);
    };

    void listen<string[]>("open-files", (event) => {
      openPaths(
        event.payload,
        navigate,
        seenRef.current,
        sectionsAccessible,
        deferredRef.current,
      );
      flushDeferred();
    }).then((fn) => {
      unlisten = fn;
    });

    void invoke<string[]>("take_pending_open_files")
      .then((pending) => {
        openPaths(
          pending,
          navigate,
          seenRef.current,
          sectionsAccessible,
          deferredRef.current,
        );
        flushDeferred();
      })
      .catch(() => {
        /* not in Tauri or command unavailable */
      });

    flushDeferred();

    return () => {
      unlisten?.();
    };
  }, [navigate, sectionsAccessible]);
}
