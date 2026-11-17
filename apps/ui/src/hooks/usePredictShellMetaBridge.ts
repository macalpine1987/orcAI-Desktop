import { useEffect } from "react";
import {
  clearShellMetaFramesBridge,
  setShellMetaFramesBridge,
} from "../lib/shellMetaFrames";

type Args = {
  activeTab: string;
  draftModel: string | undefined;
  modelSettingsOpen: boolean;
  setModelSettingsOpen: (updater: (open: boolean) => boolean) => void;
  projectDisplayName: string | null;
};

/** Keep Lab header project/model frames in sync with Parameters draft. */
export function usePredictShellMetaBridge({
  activeTab,
  draftModel,
  modelSettingsOpen,
  setModelSettingsOpen,
  projectDisplayName,
}: Args) {
  useEffect(() => {
    const modelId = draftModel;
    setShellMetaFramesBridge({
      projectNameOverride: projectDisplayName,
      // Keep header model frame in sync with Parameters (draft), not only
      // persisted workspace — default builtin may never have been saved yet.
      modelIdOverride: modelId?.trim() || null,
      modelSettingsOpen,
      onToggleModelSettings:
        activeTab !== "run" && modelId
          ? () => setModelSettingsOpen((open) => !open)
          : null,
    });
    return () => clearShellMetaFramesBridge();
  }, [
    activeTab,
    draftModel,
    modelSettingsOpen,
    projectDisplayName,
    setModelSettingsOpen,
  ]);
}
