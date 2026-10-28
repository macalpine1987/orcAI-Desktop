import { useEffect, useRef } from "react";
import { fetchProjects } from "../api/projects";
import { useSidecarStatus } from "./useSidecarStatus";
import { reconcileWorkspaceWithProjects } from "../workspace/project";

const RECONCILE_POLL_MS = 12_000;

/**
 * When Sidecar is online, refresh the project registry (and periodically while
 * it stays online). Missing folders are pruned server-side; clearing the active
 * project publishes the variant-A Home/shell notice.
 */
export function useReconcileWorkspaceOnRuntime(): void {
  const { online, engineReady } = useSidecarStatus();
  const genRef = useRef(0);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;

    const run = async () => {
      const gen = ++genRef.current;
      try {
        const list = await fetchProjects();
        if (cancelled || gen !== genRef.current) return;
        reconcileWorkspaceWithProjects(list);
      } catch {
        // Sidecar may still be warming; poll / next online retry covers it.
      }
    };

    void run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void run();
    }, RECONCILE_POLL_MS);

    const onFocus = () => {
      void run();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [online, engineReady]);
}
