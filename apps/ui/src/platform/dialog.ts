import { isTauri } from "./tauri";

export type RecordingPickKind = "wav" | "csv";

export type RecordingPick = {
  path: string;
  kind: RecordingPickKind;
};

const RECORDING_EXTENSIONS = ["wav", "csv"];
const WAV_EXTENSIONS = ["wav"];

export type RecordingFileFilter = "wav-only" | "wav-and-csv";

/**
 * Open a native file dialog (Tauri) or browser file input (dev fallback).
 */
export async function pickRecordingFile(
  filter: RecordingFileFilter = "wav-and-csv",
): Promise<RecordingPick | null> {
  const extensions =
    filter === "wav-only" ? WAV_EXTENSIONS : RECORDING_EXTENSIONS;

  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      title: "Select recording",
      filters: [
        {
          name:
            filter === "wav-only"
              ? "WAV audio"
              : "Audio / table (WAV, CSV)",
          extensions,
        },
      ],
    });
    if (!selected || Array.isArray(selected)) {
      return null;
    }
    return pathToRecordingPick(selected);
  }

  return pickRecordingViaBrowserInput(extensions);
}

/** Pick a CSV file (e.g. recording_table.csv). */
export async function pickCsvFile(
  title?: string,
  defaultPath?: string,
): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      title: title ?? "Select CSV file",
      defaultPath: defaultPath || undefined,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    return selected;
  }
  return null;
}

/** Pick a JSON file (e.g. call_duration_limits). */
export async function pickJsonFile(
  title?: string,
  defaultPath?: string,
): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      title: title ?? "Select JSON file",
      defaultPath: defaultPath || undefined,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    return selected;
  }
  return null;
}

/** Save dialog for a single label output (.txt) path. */
export async function pickLabelOutputFile(
  title?: string,
  defaultPath?: string,
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({
      title: title ?? "Save label file",
      defaultPath,
      filters: [{ name: "Label file", extensions: ["txt"] }],
    });
    return selected ?? null;
  }
  return null;
}

/** Save dialog for a CSV export. */
export async function pickCsvOutputFile(
  title?: string,
  defaultPath?: string,
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({
      title: title ?? "Save CSV",
      defaultPath,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    return selected ?? null;
  }
  return null;
}

/** Save dialog for a JSON export (e.g. orcAI parameter file). */
export async function pickJsonOutputFile(
  title?: string,
  defaultPath?: string,
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({
      title: title ?? "Save JSON file",
      defaultPath,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    return selected ?? null;
  }
  return null;
}

/** Pick a folder (recordings root or project directory). */
export async function pickDirectory(
  title?: string,
  defaultPath?: string,
): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: title ?? "Select folder",
      defaultPath: defaultPath || undefined,
    });
    if (!selected || Array.isArray(selected)) {
      return null;
    }
    return selected;
  }
  return null;
}

/** Multiple WAV files for project import. */
export async function pickAudioFiles(title?: string): Promise<string[]> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: true,
      title: title ?? "Select audio files",
      filters: [
        {
          name: "WAV audio",
          extensions: ["wav"],
        },
      ],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  }

  const picked = await pickAudioFilesViaBrowserInput();
  return picked.map((p) => p.path);
}

/** Multiple Audacity label ``.txt`` files for annotations import. */
export async function pickAnnotationFiles(title?: string): Promise<string[]> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: true,
      title: title ?? "Select annotation files",
      filters: [
        {
          name: "Audacity labels",
          extensions: ["txt"],
        },
      ],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  }

  return pickAnnotationFilesViaBrowserInput();
}

function pickAnnotationFilesViaBrowserInput(): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,text/plain";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = input.files;
      const paths: string[] = [];
      if (files) {
        for (const file of Array.from(files)) {
          const withPath = file as File & { path?: string };
          if (typeof withPath.path === "string" && withPath.path.trim()) {
            paths.push(withPath.path);
          }
        }
      }
      input.remove();
      resolve(paths);
    });
    input.click();
  });
}

/** @deprecated Use pickAudioFiles */
export async function pickWavFiles(): Promise<string[]> {
  return pickAudioFiles();
}

function pathToRecordingPick(path: string): RecordingPick {
  const lower = path.toLowerCase();
  const kind: RecordingPickKind = lower.endsWith(".csv") ? "csv" : "wav";
  return { path, kind };
}

function pickAudioFilesViaBrowserInput(): Promise<RecordingPick[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".wav,audio/wav";
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", () => {
      const files = input.files;
      cleanup();
      if (!files?.length) {
        resolve([]);
        return;
      }
      resolve(
        [...files].map((file) => ({
          path: file.name,
          kind: "wav" as RecordingPickKind,
        })),
      );
    });

    input.addEventListener("cancel", () => {
      cleanup();
      resolve([]);
    });

    input.click();
  });
}

function pickRecordingViaBrowserInput(
  extensions: string[] = RECORDING_EXTENSIONS,
): Promise<RecordingPick | null> {
  const parts: string[] = [];
  if (extensions.includes("wav")) parts.push(".wav", "audio/wav");
  if (extensions.includes("csv")) parts.push(".csv", "text/csv");
  const accept = parts.length ? parts.join(",") : ".wav,.csv,audio/wav,text/csv";

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      const kind: RecordingPickKind = file.name.toLowerCase().endsWith(".csv")
        ? "csv"
        : "wav";
      // Browser security: no full path — use name; user must run desktop app or type path.
      resolve({ path: file.name, kind });
    });

    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });

    input.click();
  });
}

export function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function isAbsolutePath(path: string): boolean {
  if (!path) return false;
  if (path.startsWith("/")) return true;
  return /^[A-Za-z]:[\\/]/.test(path);
}
