import type { PredictJobParams } from "../api/jobs";

/** Mirror of Unix `shlex.quote` used by sidecar `cli_command.build_command_line`. */
export function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  if (/^[a-zA-Z0-9_./:=@%+,^-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

/** Flag order matches sidecar `_OPTIONS["predict"]` insertion order. */
const PREDICT_OPTIONS: Array<{ key: keyof PredictJobParams; flag: string }> = [
  { key: "channel", flag: "-c" },
  { key: "model", flag: "-m" },
  { key: "model_dir", flag: "-md" },
  { key: "output_path", flag: "-o" },
  { key: "threshold", flag: "-th" },
  { key: "overwrite", flag: "-ow" },
  { key: "save_probabilities", flag: "-sp" },
  { key: "base_dir_recording", flag: "-bdr" },
  { key: "call_duration_limits", flag: "-cdl" },
  { key: "label_suffix", flag: "-ls" },
  { key: "verbosity", flag: "-v" },
];

/**
 * Build `orcai predict …` the same way the sidecar will after normalize
 * (drops `project_dir` / `recording_names`).
 */
export function buildPredictCliLine(params: PredictJobParams): string {
  const parts: string[] = ["orcai", "predict"];
  const recording = params.recording_path?.trim();
  if (recording) parts.push(shellQuote(recording));

  const seen = new Set<string>();
  for (const { key, flag } of PREDICT_OPTIONS) {
    if (!(key in params)) continue;
    if (seen.has(flag)) continue;
    const value = params[key];
    if (value === undefined || value === null) continue;
    seen.add(flag);
    if (typeof value === "boolean") {
      if (value) parts.push(flag);
      continue;
    }
    parts.push(flag);
    parts.push(shellQuote(String(value)));
  }

  return parts.join(" ");
}

/** Short CLI keys for field labels. */
export const PREDICT_CLI_KEYS = {
  model: "-m",
  modelDir: "-md",
  channel: "-c",
  threshold: "-th",
  outputPath: "-o",
  overwrite: "-ow",
  saveProbabilities: "-sp",
  callDurationLimits: "-cdl",
  labelSuffix: "-ls",
  baseDirRecording: "-bdr",
  verbosity: "-v",
} as const;
