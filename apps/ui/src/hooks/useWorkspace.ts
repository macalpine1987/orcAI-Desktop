import { useCallback, useEffect, useState } from "react";
import {
  loadWorkspace,
  WORKSPACE_CHANGED_EVENT,
  type WorkspaceState,
} from "../workspace/storage";

const WORKSPACE_KEY = "orcai-desktop.workspace";

/** Reactive workspace state; refreshes on focus and cross-tab storage updates. */
export function useWorkspace(): WorkspaceState {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => loadWorkspace());

  const refresh = useCallback(() => {
    setWorkspace(loadWorkspace());
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key == null || e.key === WORKSPACE_KEY) refresh();
    };
    const onFocus = () => refresh();
    const onWorkspaceChanged = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    };
  }, [refresh]);

  return workspace;
}
