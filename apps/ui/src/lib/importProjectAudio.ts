import {
  importProjectRecordingsJob,
  type ImportFailedRow,
  type ImportedRecordingRow,
  type ImportRecordingsJobResponse,
  type ProjectRecording,
} from "../api/projects";
import { type JobRecord } from "../api/jobs";
import { basename } from "../platform/dialog";
import { waitForJobTerminal } from "./waitForJob";

export type { ImportFailedRow } from "../api/projects";

const DEFAULT_IMPORT_JOB_TIMEOUT_MS = 30 * 60 * 1000;

const IMPORT_PARTIAL_FAILED_EN =
  "Some files failed to import:";

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Map sidecar import job rows to project recording list entries. */
export function recordingsMatchingImport(
  recs: ProjectRecording[],
  imported: ImportedRecordingRow[],
): ProjectRecording[] {
  if (!imported.length) return [];
  const destSet = new Set(imported.map((r) => normalizePath(r.dest)));
  const nameSet = new Set(imported.map((r) => r.name));
  return recs.filter((r) => {
    const norm = normalizePath(r.path);
    return destSet.has(norm) || nameSet.has(r.name);
  });
}

export function formatPartialImportError(
  failed: ImportFailedRow[],
  t?: (key: string, options?: Record<string, unknown>) => string,
): string {
  const header = t
    ? t("projects.importPartialFailed")
    : IMPORT_PARTIAL_FAILED_EN;
  const lines = failed.map(
    (f) => `${basename(f.path)}: ${f.error}`,
  );
  return `${header}\n${lines.join("\n")}`;
}

export async function runProjectAudioImportJob(
  projectId: string,
  paths: string[],
  options?: {
    onJobCreated?: (job: JobRecord) => void;
    shouldCancel?: () => boolean;
    timeoutMs?: number;
    t?: (key: string, options?: Record<string, unknown>) => string;
  },
): Promise<ImportRecordingsJobResponse> {
  const { job } = await importProjectRecordingsJob(projectId, paths);
  options?.onJobCreated?.(job);
  const finished = await waitForJobTerminal(job.id, options?.shouldCancel, {
    timeoutMs: options?.timeoutMs ?? DEFAULT_IMPORT_JOB_TIMEOUT_MS,
  });
  if (finished.status === "cancelled") {
    const partial =
      (finished.result as ImportRecordingsJobResponse | undefined) ?? null;
    if (partial?.imported?.length) {
      return {
        job_id: job.id,
        job: finished,
        imported: partial.imported,
        failed: partial.failed ?? [],
        count: partial.count ?? partial.imported.length,
      };
    }
    throw new Error(
      options?.t?.("projects.wizard.bootstrapCancelled") ?? "Import cancelled",
    );
  }
  if (finished.status === "completed") {
    const imported =
      (finished.result?.imported as ImportRecordingsJobResponse["imported"]) ??
      [];
    const failed =
      (finished.result?.failed as ImportFailedRow[] | undefined) ?? [];
    if (!imported.length && failed.length) {
      throw new Error(formatPartialImportError(failed, options?.t));
    }
    return {
      job_id: job.id,
      job: finished,
      imported,
      failed,
      count: Number(finished.result?.count ?? imported.length),
    };
  }
  throw new Error(
    finished.error ??
      (options?.t?.("predict.importFailed") ?? "Audio import failed"),
  );
}
