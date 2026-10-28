import {
  batchSelectedNames,
  predictQueueAudioFiles,
  type PredictQueue,
  type PredictQueueFile,
} from "../workspace/predictQueue";

/** True when recognition output likely exists and predict must allow overwrite. */
export function predictFileNeedsOverwrite(file: PredictQueueFile): boolean {
  return (
    file.status === "done" ||
    file.status === "filtered" ||
    Boolean(file.labelPath?.trim())
  );
}

/** WAV rows eligible for predict in this run (excludes running). */
export function predictFilesToRun(
  queue: PredictQueue,
  fileNames: string[],
): PredictQueueFile[] {
  const allowed = new Set(fileNames);
  return predictQueueAudioFiles(queue)
    .filter((f) => allowed.has(f.name))
    .filter((f) => f.status !== "running");
}

export function countPredictRunnable(
  queue: PredictQueue,
  fileNames: string[],
): number {
  return predictFilesToRun(queue, fileNames).length;
}

/** Names selected in the queue table for the next batch run. */
export function selectedFileNamesForRun(queue: PredictQueue): string[] {
  return batchSelectedNames(queue);
}

/**
 * Overwrite flag for a single predict job.
 * Respects the user setting; forces overwrite when queue state indicates prior output.
 */
export function resolvePredictOverwrite(
  file: PredictQueueFile,
  settingsOverwrite: boolean,
): boolean {
  return settingsOverwrite || predictFileNeedsOverwrite(file);
}

/** Filter output likely exists and must be replaced on re-run. */
export function filterNeedsOverwrite(file: PredictQueueFile): boolean {
  return file.status === "filtered" || Boolean(file.filteredPath?.trim());
}

/** Overwrite flag for filter-predictions jobs. */
export function resolveFilterOverwrite(
  file: PredictQueueFile,
  settingsOverwrite: boolean,
): boolean {
  return settingsOverwrite || filterNeedsOverwrite(file);
}

/** Split selection into first-run vs re-run (overwrite) files. */
export function predictRunBreakdown(
  queue: PredictQueue,
  fileNames: string[],
): { runnable: number; rerun: number; fresh: number } {
  const files = predictFilesToRun(queue, fileNames);
  let rerun = 0;
  for (const f of files) {
    if (predictFileNeedsOverwrite(f)) rerun += 1;
  }
  return {
    runnable: files.length,
    rerun,
    fresh: files.length - rerun,
  };
}

/** Stem used in recording_table.csv ``recording`` column. */
export function predictRecordingStem(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return /\.wav$/i.test(base) ? base.slice(0, -4) : base;
}

export function predictSelectionCsvPath(projectDir: string): string {
  const root = projectDir.replace(/[/\\]+$/, "");
  const useWin = /\\/.test(root) || /^[A-Za-z]:/.test(root);
  const sep = useWin ? "\\" : "/";
  return `${root}${sep}.orcai-desktop${sep}predict_selection.csv`;
}

/** True when the pending WAV set is a proper subset of recording_table stems. */
export function isCsvPredictSelectionSubset(
  pending: PredictQueueFile[],
  tableRows: Array<{ recording: string }> | null | undefined,
): boolean {
  if (!tableRows?.length || pending.length === 0) return false;
  const tableStems = new Set(
    tableRows.map((row) => predictRecordingStem(row.recording)).filter(Boolean),
  );
  if (tableStems.size === 0) return false;
  const pendingStems = new Set(pending.map((f) => predictRecordingStem(f.name)));
  for (const stem of tableStems) {
    if (!pendingStems.has(stem)) return true;
  }
  return false;
}

/** Recording path shown/copied for a CSV predict job (matches sidecar). */
export function csvPredictCliRecordingPath(args: {
  tablePath: string;
  projectDir: string | null | undefined;
  pending: PredictQueueFile[];
  tableRows?: Array<{ recording: string }> | null;
}): string {
  const table = args.tablePath.trim();
  const dir = args.projectDir?.trim();
  if (dir && isCsvPredictSelectionSubset(args.pending, args.tableRows)) {
    return predictSelectionCsvPath(dir);
  }
  return table;
}

/**
 * Prefer native orcAI CSV batch when the project has a recording table
 * (one process, model loaded once).
 */
export function canUseCsvPredictBatch(
  pending: PredictQueueFile[],
  tablePath: string | null | undefined,
): boolean {
  const table = tablePath?.trim();
  return Boolean(table) && pending.length > 0 && pending.every((f) => f.kind === "wav");
}

export type PredictBatchFileResult = {
  recording: string;
  wav_path?: string | null;
  label_path?: string | null;
  status?: string;
};

/** Match batch result rows back to queue WAV names. */
export function matchPredictBatchResultToQueueFile(
  file: PredictQueueFile,
  results: PredictBatchFileResult[],
): PredictBatchFileResult | undefined {
  const stem = predictRecordingStem(file.name);
  return results.find((row) => {
    const rec = (row.recording || "").trim();
    if (rec === stem || rec === file.name) return true;
    if (row.wav_path && row.wav_path === file.path) return true;
    return false;
  });
}

/** Latest ``[predict-file] i/n stem`` line from a job log. */
export function parsePredictFileLogLine(
  log: string[] | undefined,
): { current: number; total: number; stem: string } | null {
  if (!log?.length) return null;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const line = log[i] ?? "";
    const m = line.match(/\[predict-file\]\s+(\d+)\/(\d+)\s+(\S+)/);
    if (!m) continue;
    return {
      current: Number(m[1]),
      total: Number(m[2]),
      stem: m[3],
    };
  }
  return null;
}

/**
 * Batch progress units: completed files + half credit for the file in flight
 * (matches sidecar ``(current - 0.5) / total``).
 */
export function predictBatchProgressUnits(
  parsed: { current: number; total: number },
  jobProgress?: number | null,
): number {
  const fromLog = Math.max(0, parsed.current - 0.5);
  if (typeof jobProgress === "number" && jobProgress > 0 && parsed.total > 0) {
    return Math.max(fromLog, jobProgress * parsed.total);
  }
  return fromLog;
}

export type PredictFileQueuePatch = {
  name: string;
  status: "running" | "done";
  labelPath?: string;
};

/**
 * When CSV batch advances to file ``k``, mark prior pending rows as done
 * (inferred label) so Results / spectrogram unlock mid-run.
 */
export function predictFileQueuePatchesFromLog(
  pending: PredictQueueFile[],
  parsed: { current: number; total: number; stem: string },
  inferLabelPath: (file: PredictQueueFile) => string,
): PredictFileQueuePatch[] {
  const idx = pending.findIndex(
    (f) => predictRecordingStem(f.name) === parsed.stem,
  );
  if (idx < 0) {
    return pending
      .filter((f) => predictRecordingStem(f.name) === parsed.stem)
      .map((f) => ({ name: f.name, status: "running" as const }));
  }
  const patches: PredictFileQueuePatch[] = [];
  for (let i = 0; i < pending.length; i += 1) {
    const file = pending[i]!;
    if (i < idx) {
      patches.push({
        name: file.name,
        status: "done",
        labelPath: file.labelPath?.trim() || inferLabelPath(file),
      });
    } else if (i === idx) {
      patches.push({ name: file.name, status: "running" });
    }
  }
  return patches;
}
