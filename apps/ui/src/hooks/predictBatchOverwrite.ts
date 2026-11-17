import { pathExists } from "../api/fs";
import { predictFileNeedsOverwrite } from "../lib/predictBatch";
import { expectedPredictOutputPath } from "../lib/predictOverwrite";
import { silentCatch } from "../lib/silentCatch";
import type { PredictQueueFile } from "../workspace/predictQueue";
import { resolvePredictOverwrite } from "../lib/predictBatch";

export type OverwritePrompt = (
  fileName: string,
  labelPath: string,
) => Promise<boolean>;

export type OverwriteResolve =
  | { kind: "run"; overwrite: boolean }
  /** Skip without changing queue status (e.g. unmounted during prompt). */
  | { kind: "skip" }
  /** User declined overwrite — reset file to pending. */
  | { kind: "decline" };

/**
 * Resolve per-file overwrite: settings flag, then optional existence prompt.
 */
export async function resolveFileOverwriteFlag(opts: {
  file: PredictQueueFile;
  settingsOverwrite: boolean;
  channel: number;
  model: string;
  modelLabel: string | undefined;
  outputPath: string | undefined;
  mounted: boolean;
  askFileOverwrite: OverwritePrompt;
}): Promise<OverwriteResolve> {
  const {
    file,
    settingsOverwrite,
    channel,
    model,
    modelLabel,
    outputPath,
    mounted,
    askFileOverwrite,
  } = opts;

  const overwriteFlag = resolvePredictOverwrite(file, settingsOverwrite);
  if (overwriteFlag) return { kind: "run", overwrite: true };

  const expectedLabel = expectedPredictOutputPath(
    file.path,
    channel,
    model,
    modelLabel,
    outputPath ?? "",
  );
  try {
    if (!(await pathExists(expectedLabel))) {
      return { kind: "run", overwrite: false };
    }
    if (!mounted) return { kind: "skip" };
    const confirmed = await askFileOverwrite(file.name, expectedLabel);
    if (!confirmed) return { kind: "decline" };
    return { kind: "run", overwrite: true };
  } catch (err) {
    silentCatch("predictOverwritePreflight")(err);
    return { kind: "run", overwrite: overwriteFlag };
  }
}

export function fileNeedsBatchOverwritePrompt(
  file: PredictQueueFile,
): boolean {
  return predictFileNeedsOverwrite(file);
}
