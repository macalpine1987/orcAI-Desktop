import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { JobRecord } from "../api/jobs";
import type { OrcaiModel } from "../api/models";
import type { PredictSettings } from "../workspace/predictSettings";
import type { PredictQueue } from "../workspace/predictQueue";
import type { PredictRecordingTableRow } from "./usePredictRecordingTable";

export type UsePredictBatchRunOptions = {
  queue: PredictQueue | null;
  setQueue: Dispatch<SetStateAction<PredictQueue | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  draftSettings: PredictSettings;
  models: OrcaiModel[];
  orcaiReady: boolean;
  predictTableBlocked: boolean;
  recordingTablePath: string;
  recordingTableRows: PredictRecordingTableRow[];
  predictMountedRef: MutableRefObject<boolean>;
  askFileOverwrite: (fileName: string, labelPath: string) => Promise<boolean>;
  askBatchOverwrite: (count: number, total: number) => Promise<boolean>;
  trackJobInLab: (job: JobRecord) => void;
  startBatch: (total: number) => void;
  updateBatchProgress: (done: number, total?: number) => void;
  endBatch: () => void;
  notifySaved: (message?: string) => void;
  notifyHeaderError: (message: string) => void;
  dismissHeaderError: () => void;
  /** Pulse the Analysis tab after a successful run instead of auto-navigating. */
  setAnalysisTabHint: Dispatch<SetStateAction<boolean>>;
};

export type UsePredictBatchRunResult = {
  runBatchRecognition: () => Promise<void>;
  onBatchCancel: () => void;
};
