import { useEffect, useMemo } from "react";
import { isPredictResultBrowsable } from "./predictQueueUi";
import {
  predictQueueAudioFiles,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";

export function recognizedQueueFiles(
  queue: PredictQueue,
  opts?: { onlyWithLabels?: boolean },
): PredictQueueFile[] {
  const files = predictQueueAudioFiles(queue).filter(isPredictResultBrowsable);
  if (!opts?.onlyWithLabels) return files;
  return files.filter(
    (f) => Boolean(f.labelPath?.trim() || f.filteredPath?.trim()),
  );
}

export function usePredictResultFiles(
  queue: PredictQueue,
  active: PredictQueueFile | null,
  onSelectFile: (name: string) => void,
  opts?: { onlyWithLabels?: boolean },
): {
  visibleFiles: PredictQueueFile[];
  canPrev: boolean;
  canNext: boolean;
  goRelative: (delta: number) => void;
  activeFile: PredictQueueFile | null;
} {
  const onlyWithLabels = opts?.onlyWithLabels ?? false;
  const visibleFiles = useMemo(
    () => recognizedQueueFiles(queue, { onlyWithLabels }),
    [queue, onlyWithLabels],
  );

  const visibleNamesKey = visibleFiles.map((f) => f.name).join("\0");

  useEffect(() => {
    if (visibleFiles.length === 0) return;
    const activeInList =
      active?.name != null &&
      visibleFiles.some((f) => f.name === active.name);
    if (!activeInList) {
      onSelectFile(visibleFiles[0]!.name);
    }
  }, [visibleNamesKey, active?.name, onSelectFile, visibleFiles]);

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

  const activeFile =
    active?.name && visibleFiles.some((f) => f.name === active.name)
      ? active
      : null;

  return {
    visibleFiles,
    canPrev,
    canNext,
    goRelative,
    activeFile,
  };
}
