import { useMemo } from "react";
import type { PredictedFilterSource } from "../components/PredictFilterStudio";
import { channelForQueueFile } from "../lib/predictQueueStudio";
import {
  projectCallDurationLimitsPath,
  type PredictSettings,
} from "../workspace/predictSettings";
import {
  resolveFilterPredictedPath,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";

type Options = {
  queue: PredictQueue | null;
  active: PredictQueueFile | null | undefined;
  recordingTableRows: Array<{ recording: string; channel: number | null }>;
  predictChannel: number;
  modelId: string;
  modelLabelName?: string;
  draftSettings: PredictSettings;
  workspaceProjectDir: string | null | undefined;
  workspaceProjectName: string | null | undefined;
  onSelectActive: (name: string) => void;
};

export function usePredictFilterDerived({
  queue,
  active,
  recordingTableRows,
  predictChannel,
  modelId,
  modelLabelName,
  draftSettings,
  workspaceProjectDir,
  workspaceProjectName,
  onSelectActive,
}: Options) {
  const channelForFile = (file: PredictQueueFile) =>
    channelForQueueFile(file, recordingTableRows, predictChannel);
  const activeChannel = active ? channelForFile(active) : predictChannel;

  const filterSourcePath =
    active != null
      ? resolveFilterPredictedPath(
          active,
          channelForFile(active),
          modelId,
          modelLabelName,
        ) ?? ""
      : "";

  const filterSources = useMemo(() => {
    if (!queue) return [];
    const out: PredictedFilterSource[] = [];
    const seen = new Set<string>();
    for (const file of queue.files) {
      const path = resolveFilterPredictedPath(
        file,
        channelForQueueFile(file, recordingTableRows, predictChannel),
        modelId,
        modelLabelName,
      );
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({ file, predictedPath: path });
    }
    return out;
  }, [queue, recordingTableRows, predictChannel, modelId, modelLabelName]);

  const filterTrackSource = filterSources.find(
    (s) => s.predictedPath === filterSourcePath,
  );
  const filterTrackChannel = filterTrackSource
    ? channelForFile(filterTrackSource.file)
    : activeChannel;

  const filterLimitsPath =
    draftSettings.callDurationLimits.trim() ||
    (queue
      ? projectCallDurationLimitsPath(
          queue.projectDir,
          workspaceProjectDir === queue.projectDir
            ? workspaceProjectName
            : null,
        )
      : "");

  const onSelectPredictedPath = (path: string) => {
    const hit = filterSources.find((s) => s.predictedPath === path);
    if (hit) onSelectActive(hit.file.name);
  };

  return {
    channelForFile,
    activeChannel,
    filterSourcePath,
    filterSources,
    filterTrackSource,
    filterTrackChannel,
    filterLimitsPath,
    onSelectPredictedPath,
  };
}
