import { exportAudacityLabels } from "../api/labels";
import { basename, isAbsolutePath, pickDirectory } from "../platform/dialog";
import { isTauri } from "../platform/tauri";
import { labelPathForQueueFile } from "./predictQueueUi";
import { channelForQueueFile } from "./predictQueueStudio";
import type { PredictQueueFile } from "../workspace/predictQueue";

export type ExportAudacityBatchResult = {
  exported: number;
  skipped: number;
  empty: number;
  errors: { fileName: string; message: string }[];
  cancelled?: boolean;
};

function joinPath(dir: string, fileName: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[/\\]+$/, "")}${sep}${fileName}`;
}

function suggestedAudacityName(labelPath: string): string {
  const stem = basename(labelPath).replace(/\.txt$/i, "");
  return `${stem}_audacity.txt`;
}

function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPackageFilesToAudacity(params: {
  files: PredictQueueFile[];
  selectedNames: ReadonlySet<string>;
  channel: number;
  modelId: string;
  modelLabelName?: string;
  orcaiParameter?: string | null;
  /** Native folder-picker title (Tauri). */
  directoryTitle?: string;
}): Promise<ExportAudacityBatchResult> {
  const targets = params.files.filter(
    (f) => f.kind === "wav" && params.selectedNames.has(f.name),
  );

  const result: ExportAudacityBatchResult = {
    exported: 0,
    skipped: 0,
    empty: 0,
    errors: [],
  };

  if (targets.length === 0) return result;

  let outputDir: string | null = null;
  if (isTauri()) {
    outputDir = await pickDirectory(
      params.directoryTitle ?? "Export Audacity labels",
    );
    if (!outputDir) {
      return { ...result, cancelled: true };
    }
  }

  for (const file of targets) {
    const channel = channelForQueueFile(file, [], params.channel);
    const labelPath = labelPathForQueueFile(
      file,
      channel,
      params.modelId,
      params.modelLabelName,
    );
    if (!labelPath) {
      result.skipped += 1;
      continue;
    }

    try {
      if (isTauri() && outputDir) {
        const outPath = joinPath(outputDir, suggestedAudacityName(labelPath));
        const exported = await exportAudacityLabels({
          labelPath,
          wavPath: file.path,
          outputPath: outPath,
          channel,
          orcaiParameter: params.orcaiParameter ?? undefined,
        });
        if (exported.line_count === 0) {
          result.empty += 1;
        } else {
          result.exported += 1;
        }
        continue;
      }

      const exported = await exportAudacityLabels({
        labelPath,
        wavPath: isAbsolutePath(file.path) ? file.path : undefined,
        channel,
        orcaiParameter: params.orcaiParameter ?? undefined,
      });

      if (exported.output_path) {
        if (exported.line_count === 0) {
          result.empty += 1;
        } else {
          result.exported += 1;
        }
      } else if (exported.content != null) {
        if (exported.content.trim().length === 0) {
          result.empty += 1;
        } else {
          downloadTextFile(
            exported.content,
            exported.suggested_name ?? suggestedAudacityName(labelPath),
          );
          result.exported += 1;
        }
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      result.errors.push({
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
