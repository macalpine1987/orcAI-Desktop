import { inferPredictedLabelPath } from "./predictLabels";
import { predictRecordingStem } from "./predictBatch";

const EXISTS_MARKERS = [
  "Annotation file already exists:",
  "Output already exists:",
  "FileExistsError",
] as const;

/** True when a predict/filter job failed because the output label file exists. */
export function isAnnotationExistsError(
  error: string | null | undefined,
): boolean {
  if (!error?.trim()) return false;
  return EXISTS_MARKERS.some((m) => error.includes(m));
}

/** Extract output path from orcAI / sidecar FileExistsError messages. */
export function parseAnnotationExistsPath(
  error: string | null | undefined,
): string | null {
  if (!error?.trim()) return null;
  const explicit = error.match(
    /(?:Annotation file already exists|Output already exists):\s*(.+)$/m,
  );
  if (explicit?.[1]) return explicit[1].trim();
  const outputLine = error.match(/^Output file:\s*(.+)$/m);
  if (outputLine?.[1]) return outputLine[1].trim();
  return null;
}

export function expectedPredictOutputPath(
  wavPath: string,
  channel: number,
  modelId: string,
  modelLabelName: string | undefined,
  outputPathSetting: string,
  opts?: { csvBatch?: boolean },
): string {
  const custom = outputPathSetting.trim();
  if (custom && custom !== "default") {
    if (opts?.csvBatch) {
      return resolveCsvBatchCustomOutputPath(
        wavPath,
        custom,
        modelId,
      );
    }
    return custom;
  }
  return inferPredictedLabelPath(wavPath, channel, modelId, modelLabelName);
}

/** Mirror sidecar ``resolve_csv_batch_label_path``: custom ``-o`` is a directory. */
export function resolveCsvBatchCustomOutputPath(
  wavPath: string,
  outputDir: string,
  modelDirStem: string,
): string {
  const base = wavPath.split(/[/\\]/).pop() ?? wavPath;
  const stem = predictRecordingStem(base);
  const model =
    modelDirStem.replace(/\.keras$/i, "").split(/[/\\]/).pop() || modelDirStem;
  const dir = outputDir.replace(/[/\\]+$/, "");
  const useWin = /\\/.test(dir) || /^[A-Za-z]:/.test(dir);
  const sep = useWin ? "\\" : "/";
  return `${dir}${sep}${stem}_${model}_predicted.txt`;
}
