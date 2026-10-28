import type { ImportFailedRow, ImportedRecordingRow } from "../api/projects";
import { basename } from "../platform/dialog";

export type WizardImportStatus = "pending" | "imported" | "failed";

export type WizardImportPick = {
  sourcePath: string;
  /** File name in project recordings/ after import. */
  recordingName: string;
  /** Basename of the file chosen in the dialog. */
  sourceLabel: string;
  status: WizardImportStatus;
  error?: string;
};

export function isWavFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".wav");
}

export function isSupportedAudioFileName(name: string): boolean {
  return isWavFileName(name);
}

/** Keep only ``.wav`` paths; collect rejected file basenames for user feedback. */
export function filterWavImportPaths(paths: string[]): {
  wavPaths: string[];
  rejected: string[];
} {
  const wavPaths: string[] = [];
  const rejected: string[] = [];
  for (const sourcePath of paths) {
    const label = basename(sourcePath);
    if (!isWavFileName(label)) {
      rejected.push(label);
      continue;
    }
    wavPaths.push(sourcePath);
  }
  return { wavPaths, rejected };
}

/** User-visible error when non-WAV files were selected. */
export function formatWavOnlyImportError(
  t: (key: string, options?: Record<string, unknown>) => string,
  rejected: string[],
): string | null {
  if (!rejected.length) return null;
  if (rejected.length === 1) {
    return t("audioImport.wavOnlyOne", { name: rejected[0] });
  }
  return t("audioImport.wavOnlyMany", { names: rejected.join(", ") });
}

function pickFromPath(sourcePath: string, status: WizardImportStatus = "pending"): WizardImportPick {
  const sourceLabel = basename(sourcePath);
  return {
    sourcePath,
    recordingName: sourceLabel,
    sourceLabel,
    status,
  };
}

/** Split dialog paths into supported picks and rejected basenames. */
export function splitPathsForWizardImport(paths: string[]): {
  picks: WizardImportPick[];
  rejected: string[];
} {
  const { wavPaths, rejected } = filterWavImportPaths(paths);
  return { picks: wavPaths.map((p) => pickFromPath(p)), rejected };
}

/** Predict recording file names from paths chosen before import. */
export function wizardImportPicksFromPaths(paths: string[]): WizardImportPick[] {
  return splitPathsForWizardImport(paths).picks;
}

/** After import job — use actual dest names (handles collisions). */
export function wizardImportPicksFromImported(
  rows: ImportedRecordingRow[],
): WizardImportPick[] {
  return rows.map((row) => ({
    sourcePath: row.source,
    recordingName: row.name,
    sourceLabel: basename(row.source),
    status: "imported" as const,
  }));
}

export function mergeWizardImportPicks(
  prev: WizardImportPick[],
  added: WizardImportPick[],
): WizardImportPick[] {
  const map = new Map(prev.map((p) => [p.sourcePath, p]));
  for (const pick of added) {
    map.set(pick.sourcePath, { ...pick, status: pick.status ?? "pending" });
  }
  return [...map.values()];
}

export function removeWizardImportPick(
  prev: WizardImportPick[],
  sourcePath: string,
): WizardImportPick[] {
  return prev.filter((p) => p.sourcePath !== sourcePath);
}

/** Merge sidecar import results into wizard picks (keeps failed rows). */
export function applyImportResultToWizardPicks(
  prev: WizardImportPick[],
  imported: ImportedRecordingRow[],
  failed: ImportFailedRow[],
): WizardImportPick[] {
  const importedBySource = new Map(imported.map((r) => [r.source, r]));
  const failedByPath = new Map(failed.map((f) => [f.path, f.error]));

  const seen = new Set<string>();
  const next: WizardImportPick[] = [];

  for (const pick of prev) {
    const row = importedBySource.get(pick.sourcePath);
    if (row) {
      next.push({
        sourcePath: pick.sourcePath,
        recordingName: row.name,
        sourceLabel: basename(row.source),
        status: "imported",
      });
      seen.add(pick.sourcePath);
      continue;
    }
    const err = failedByPath.get(pick.sourcePath);
    if (err) {
      next.push({ ...pick, status: "failed", error: err });
      seen.add(pick.sourcePath);
      continue;
    }
    next.push(pick);
  }

  for (const row of imported) {
    if (seen.has(row.source)) continue;
    next.push(...wizardImportPicksFromImported([row]));
  }

  for (const f of failed) {
    if (seen.has(f.path)) continue;
    const label = basename(f.path);
    next.push({
      sourcePath: f.path,
      recordingName: label,
      sourceLabel: label,
      status: "failed",
      error: f.error,
    });
  }

  return next;
}
