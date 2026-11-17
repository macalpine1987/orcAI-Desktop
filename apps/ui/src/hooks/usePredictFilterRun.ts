import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { createJob, type JobRecord } from "../api/jobs";
import { pathExists } from "../api/fs";
import { resolveFilterJobOutputPath } from "../lib/callDurationLimits";
import {
  channelForQueueFile,
} from "../lib/predictQueueStudio";
import { resolveFilterOverwrite } from "../lib/predictBatch";
import { waitForJobTerminal } from "../lib/waitForJob";
import { saveWorkspace } from "../workspace/storage";
import type { FilterSettings } from "../workspace/predictSettings";
import {
  patchPredictQueueFile,
  resolveFilterPredictedPath,
  type PredictQueue,
} from "../workspace/predictQueue";
import { useJobPoller } from "./useJobPoller";
import type { PredictRecordingTableRow } from "./usePredictRecordingTable";

type Options = {
  queue: PredictQueue | null;
  queueRef: MutableRefObject<PredictQueue | null>;
  setQueue: Dispatch<SetStateAction<PredictQueue | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  recordingTableRows: PredictRecordingTableRow[];
  predictChannel: number;
  modelId: string;
  modelLabelName: string | null | undefined;
  filterSettings: FilterSettings;
  labelSuffix: string;
  askFileOverwrite: (fileName: string, labelPath: string) => Promise<boolean>;
  trackJobInLab: (job: JobRecord) => void;
};

/**
 * Batch filter-predictions submit: overwrite prompts, job create/wait,
 * queue patches, and live filterJob polling while a run is in flight.
 */
export function usePredictFilterRun({
  queue,
  queueRef,
  setQueue,
  setError,
  recordingTableRows,
  predictChannel,
  modelId,
  modelLabelName,
  filterSettings,
  labelSuffix,
  askFileOverwrite,
  trackJobInLab,
}: Options): {
  filterJob: JobRecord | null;
  filterSubmitting: boolean;
  onRunFilter: (
    predictedPaths: string[],
    limitsJsonPath: string,
  ) => Promise<void>;
} {
  const { t } = useTranslation();
  const filterTargetFileRef = useRef<string | null>(null);
  const [filterJob, setFilterJob] = useState<JobRecord | null>(null);
  const [filterSubmitting, setFilterSubmitting] = useState(false);

  useJobPoller(filterJob, setFilterJob);

  useEffect(() => {
    if (!filterJob) return;
    if (filterJob.status === "completed" && filterJob.result?.label_path) {
      const path = String(filterJob.result.label_path);
      const name = filterTargetFileRef.current;
      if (name) {
        const next = patchPredictQueueFile(
          name,
          { status: "filtered", filteredPath: path },
          queueRef.current,
        );
        if (next) setQueue(next);
      }
      saveWorkspace({ lastLabelPath: path });
      return;
    }
    if (filterJob.status === "failed" || filterJob.status === "cancelled") {
      setError(
        filterJob.error ??
          (filterJob.status === "cancelled"
            ? t("predict.filterCancelled")
            : t("predict.filterFailed")),
      );
      setFilterJob(null);
    }
  }, [filterJob, queueRef, setQueue, setError, t]);

  const onRunFilter = async (
    predictedPaths: string[],
    limitsJsonPath: string,
  ) => {
    if (!queue || predictedPaths.length === 0) return;
    setFilterSubmitting(true);
    setError(null);
    try {
      for (const predicted of predictedPaths) {
        const file =
          queueRef.current?.files.find((row) => {
            const path = resolveFilterPredictedPath(
              row,
              channelForQueueFile(row, recordingTableRows, predictChannel),
              modelId,
              modelLabelName ?? undefined,
            );
            return path === predicted;
          }) ?? null;
        filterTargetFileRef.current = file?.name ?? null;
        let overwrite = file
          ? resolveFilterOverwrite(file, filterSettings.overwrite)
          : filterSettings.overwrite;
        // Multi-file: always per-WAV default (*_predicted_filtered.txt). A shared
        // custom -o would clobber one file with every recording's labels.
        const outputFile =
          predictedPaths.length > 1
            ? "default"
            : filterSettings.outputFile.trim() || "default";
        if (!overwrite) {
          try {
            const filteredPath = resolveFilterJobOutputPath(
              predicted,
              outputFile,
            );
            if (await pathExists(filteredPath)) {
              const label =
                file?.name ?? filteredPath.split(/[/\\]/).pop() ?? predicted;
              const confirmed = await askFileOverwrite(label, filteredPath);
              if (!confirmed) {
                continue;
              }
              overwrite = true;
            }
          } catch {
            /* path check unavailable — run and handle job error if needed */
          }
        }
        const job = await createJob("filter-predictions", {
          predicted_labels: predicted,
          project_dir: queue.projectDir,
          output_file: outputFile,
          overwrite,
          label_suffix: labelSuffix,
          call_duration_limits: limitsJsonPath,
        });
        setFilterJob(job);
        trackJobInLab(job);
        const finished = await waitForJobTerminal(job.id);
        if (finished.status !== "completed") {
          setError(
            finished.error ??
              (finished.status === "cancelled"
                ? t("predict.filterCancelled")
                : t("predict.filterFailed")),
          );
          break;
        }
        const outPath = finished.result?.label_path
          ? String(finished.result.label_path)
          : null;
        if (file && outPath) {
          const next = patchPredictQueueFile(
            file.name,
            { status: "filtered", filteredPath: outPath },
            queueRef.current,
          );
          if (next) setQueue(next);
          saveWorkspace({ lastLabelPath: outPath });
        }
      }
    } catch (err) {
      setError(formatUserFacingErrorRequired(err, t));
    } finally {
      setFilterSubmitting(false);
      setFilterJob(null);
    }
  };

  return { filterJob, filterSubmitting, onRunFilter };
}
