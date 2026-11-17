import { useCallback, useState } from "react";
import { useTrackJobInLab } from "./useTrackJobInLab";
import { useSidecarStatus } from "./useSidecarStatus";
import { useWorkspace } from "./useWorkspace";
import { activePredictFile } from "../workspace/predictQueue";
import { usePredictQueueImport } from "./usePredictQueueImport";
import { usePredictSession } from "../predict/PredictSessionContext";

export type { PredictQueueUnavailableReason } from "../lib/predictQueueUi";
export type { PredictQueueLocationState } from "../predict/PredictSessionContext";

/** Page façade over PredictSessionProvider + WAV import helpers. */
export function usePredictQueue() {
  const { online: sidecarOnline, engineReady } = useSidecarStatus();
  const trackJobInLab = useTrackJobInLab();
  const workspace = useWorkspace();
  const session = usePredictSession();
  const [error, setError] = useState<string | null>(null);

  const {
    queue,
    setQueue,
    syncQueue,
    queueLoading,
    activeProject,
    setActiveProject,
    projectLoadFailed,
    queueUnavailable,
    refreshQueueFromServer,
    queueRef,
  } = session;

  const active = activePredictFile(queue);
  const hasActiveProject = Boolean(workspace.activeProjectId);

  const { importingWavs, onAddWavs } = usePredictQueueImport({
    workspaceActiveProjectId: workspace.activeProjectId,
    activeProject,
    setActiveProject,
    sidecarOnline,
    engineReady,
    queueRef,
    syncQueue,
    setError,
    trackJobInLab,
    refreshQueueFromServer,
  });

  const onSelectActive = useCallback(
    (name: string) => {
      if (!queueRef.current) return;
      syncQueue({ ...queueRef.current, activeFileName: name });
    },
    [syncQueue, queueRef],
  );

  const onRemoveActive = useCallback(() => {
    if (!queue?.activeFileName) return;
    const name = queue.activeFileName;
    const files = queue.files.filter((f) => f.name !== name);
    const selectedNames = queue.selectedNames.filter((n) =>
      files.some((f) => f.name === n),
    );
    syncQueue({
      ...queue,
      files,
      selectedNames,
      activeFileName: files[0]?.name ?? null,
    });
  }, [queue, syncQueue]);

  return {
    queue,
    setQueue,
    syncQueue,
    queueLoading,
    activeProject,
    projectLoadFailed,
    queueUnavailable,
    importingWavs,
    error,
    setError,
    workspace,
    active,
    hasActiveProject,
    sidecarOnline,
    onSelectActive,
    onAddWavs,
    onRemoveActive,
    refreshQueueFromServer,
  };
}
