import { useEffect, useMemo } from "react";
import {
  isRecognitionComplete,
  labelPathForQueueFile,
  packageQueueFiles,
} from "./predictQueueUi";
import {
  resolvePackageFileNames,
  type AnalysisPackage,
} from "../workspace/analysisPackages";
import type { PredictQueue, PredictQueueFile } from "../workspace/predictQueue";

export function useAnalysisPackageFiles(
  queue: PredictQueue,
  activePackage: AnalysisPackage | null,
  onlyWithLabels: boolean,
  channel: number,
  modelId: string,
  modelLabelName: string | undefined,
  active: PredictQueueFile | null,
  onSelectFile: (name: string) => void,
): {
  resolvedNames: string[];
  visibleFiles: PredictQueueFile[];
  canPrev: boolean;
  canNext: boolean;
  goRelative: (delta: number) => void;
  activeInPackage: PredictQueueFile | null;
} {
  const resolvedNames = useMemo(
    () =>
      activePackage ? resolvePackageFileNames(queue, activePackage) : [],
    [queue, activePackage],
  );

  const visibleFiles = useMemo(() => {
    if (!activePackage) return [];
    const all = packageQueueFiles(queue, resolvedNames);
    if (!onlyWithLabels) return all;
    return all.filter(
      (f) =>
        isRecognitionComplete(f) &&
        Boolean(labelPathForQueueFile(f, channel, modelId, modelLabelName)),
    );
  }, [
    activePackage,
    queue,
    resolvedNames,
    onlyWithLabels,
    channel,
    modelId,
    modelLabelName,
  ]);

  const visibleNamesKey = visibleFiles.map((f) => f.name).join("\0");

  useEffect(() => {
    if (visibleFiles.length === 0) return;
    const activeInList =
      active?.name != null &&
      visibleFiles.some((f) => f.name === active.name);
    if (!activeInList) {
      onSelectFile(visibleFiles[0]!.name);
    }
  }, [onlyWithLabels, visibleNamesKey, active?.name, onSelectFile, visibleFiles]);

  const navIndex = active?.name
    ? visibleFiles.findIndex((f) => f.name === active.name)
    : -1;
  const canPrev = navIndex > 0;
  const canNext = navIndex >= 0 && navIndex < visibleFiles.length - 1;

  const goRelative = (delta: number) => {
    if (navIndex < 0) {
      const first = visibleFiles[0];
      if (first) onSelectFile(first.name);
      return;
    }
    const next = visibleFiles[navIndex + delta];
    if (next) onSelectFile(next.name);
  };

  const activeInPackage =
    active?.name && resolvedNames.includes(active.name) ? active : null;

  return {
    resolvedNames,
    visibleFiles,
    canPrev,
    canNext,
    goRelative,
    activeInPackage: activePackage ? activeInPackage : null,
  };
}
