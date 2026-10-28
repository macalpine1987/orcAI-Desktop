import { saveWorkspace } from "../workspace/storage";

export type OpenFileTarget = {
  route: "/predict" | "/spectrogram" | "/projects";
  state: Record<string, string>;
};

/** Infer WAV path from orcAI `*_c{N}_{model}_predicted.txt` / `_filtered.txt`. */
export function inferWavFromLabelPath(labelPath: string): string | null {
  const match = labelPath.match(/^(.+)_c\d+_.+_(predicted|filtered)\.txt$/i);
  if (match) return `${match[1]}.wav`;
  if (/_filtered\.txt$/i.test(labelPath)) {
    return labelPath.replace(/_filtered\.txt$/i, ".wav");
  }
  if (/_predicted\.txt$/i.test(labelPath)) {
    return labelPath.replace(/_predicted\.txt$/i, ".wav");
  }
  return null;
}

/** Map an absolute filesystem path to a route + navigation state. */
export function resolveOpenFilePath(path: string): OpenFileTarget | null {
  const trimmed = path.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  if (lower.endsWith(".wav")) {
    saveWorkspace({ lastWavPath: trimmed });
    return {
      route: "/predict",
      state: { wavPath: trimmed },
    };
  }

  if (lower.endsWith(".txt")) {
    const wav = inferWavFromLabelPath(trimmed);
    saveWorkspace({
      lastLabelPath: trimmed,
      ...(wav ? { lastWavPath: wav } : {}),
    });
    return {
      route: "/predict",
      state: {
        tab: "results",
        labelPath: trimmed,
        ...(wav ? { wavPath: wav } : {}),
      },
    };
  }

  if (lower.endsWith(".csv")) {
    saveWorkspace({ recordingTablePath: trimmed });
    const base = trimmed.split(/[/\\]/).pop()?.toLowerCase() ?? "";
    if (base.includes("recording_table")) {
      return {
        route: "/projects",
        state: { recordingTablePath: trimmed },
      };
    }
    return {
      route: "/predict",
      state: {
        recordingPath: trimmed,
        recordingKind: "csv",
      },
    };
  }

  return null;
}
