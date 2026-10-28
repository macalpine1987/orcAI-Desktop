import {
  predictQueueAudioFiles,
  type PredictQueue,
  type PredictQueueFile,
  type PredictQueueFileStatus,
} from "../workspace/predictQueue";
import { predictRecordingStem } from "./predictBatch";

export type PredictQueueViewFilter = "all" | "new" | "failed";

/** Row matches the queue filter strip (all / new / errors). */
export function matchesPredictQueueFilter(
  file: PredictQueueFile,
  filter: PredictQueueViewFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "failed") return file.status === "failed";
  // "new" ≈ not yet successfully recognized
  const done: PredictQueueFileStatus[] = ["done", "filtered"];
  return !done.includes(file.status) && file.status !== "running";
}

export function filterPredictQueueFiles(
  queue: PredictQueue | null,
  filter: PredictQueueViewFilter,
): PredictQueueFile[] {
  if (!queue) return [];
  return predictQueueAudioFiles(queue).filter((f) =>
    matchesPredictQueueFilter(f, filter),
  );
}

const ETA_REALTIME_FACTOR = 0.35;
const ETA_FALLBACK_SEC_PER_FILE = 45;

/** Estimated wall time for selected runnable WAV rows. */
export function estimatePredictEtaSeconds(
  files: Array<{ duration_sec: number | null | undefined }>,
): number {
  if (files.length === 0) return 0;
  let known = 0;
  let sum = 0;
  for (const f of files) {
    const d = f.duration_sec;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      known += 1;
      sum += d * ETA_REALTIME_FACTOR;
    }
  }
  const missing = files.length - known;
  return Math.max(0, Math.round(sum + missing * ETA_FALLBACK_SEC_PER_FILE));
}

export function formatPredictEta(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `~${h}h ${rm}m` : `~${h}h`;
}

/** Sum of known WAV durations (seconds); null if none known. */
export function sumPredictQueueDurationSec(
  files: Array<{ duration_sec: number | null | undefined }>,
): number | null {
  let sum = 0;
  let known = 0;
  for (const f of files) {
    const d = f.duration_sec;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      sum += d;
      known += 1;
    }
  }
  return known === 0 ? null : sum;
}

/** Total audio duration label for queue header (m03: «4.6 ч» / «4.6 h»). */
export function formatPredictQueueHours(
  files: Array<{ duration_sec: number | null | undefined }>,
  unitHours: string,
  unitMinutes: string,
): string | null {
  const sum = sumPredictQueueDurationSec(files);
  if (sum == null) {
    // Empty queue still shows «0 ч» so the meta never looks like a lone dash.
    return files.length === 0 ? `0 ${unitHours}` : null;
  }
  const hours = sum / 3600;
  if (hours < 0.1) {
    return `${Math.max(1, Math.round(sum / 60))} ${unitMinutes}`;
  }
  return `${hours.toFixed(1)} ${unitHours}`;
}

/**
 * Shared `-o` directory/file: same WAV stem with different channels will
 * overwrite each other (orcAI omits channel in the output name).
 */
export function hasSharedOutputChannelCollision(args: {
  outputPath: string;
  entries: Array<{ recordingStem: string; channel: number }>;
}): boolean {
  const out = args.outputPath.trim();
  if (!out || out.toLowerCase() === "default") return false;
  const byStem = new Map<string, Set<number>>();
  for (const e of args.entries) {
    const stem = e.recordingStem.trim();
    if (!stem) continue;
    const ch = Math.max(1, Math.floor(e.channel) || 1);
    let set = byStem.get(stem);
    if (!set) {
      set = new Set();
      byStem.set(stem, set);
    }
    set.add(ch);
    if (set.size > 1) return true;
  }
  return false;
}

/** Build collision entries from selected queue names + optional per-file channels. */
export function collisionEntriesFromSelection(
  selectedNames: string[],
  channelByName: Map<string, number> | Record<string, number>,
  fallbackChannel: number,
): Array<{ recordingStem: string; channel: number }> {
  const map =
    channelByName instanceof Map
      ? channelByName
      : new Map(Object.entries(channelByName));
  return selectedNames.map((name) => ({
    recordingStem: predictRecordingStem(name),
    channel: map.get(name) ?? map.get(predictRecordingStem(name)) ?? fallbackChannel,
  }));
}

/**
 * Index recording_table channels by both stem and `*.wav` name so queue
 * selection (usually with extension) resolves to the CSV channel column.
 */
export function channelMapFromRecordingTableRows(
  rows: Array<{ recording: string; channel: number | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.channel == null || !Number.isFinite(row.channel)) continue;
    const ch = Math.max(1, Math.floor(row.channel));
    const raw = row.recording.trim();
    if (!raw) continue;
    const stem = predictRecordingStem(raw);
    out[raw] = ch;
    out[stem] = ch;
    if (!/\.wav$/i.test(raw)) out[`${stem}.wav`] = ch;
  }
  return out;
}

/**
 * Collision entries for selected queue files using recording_table rows.
 * If the table lists the same recording stem on multiple rows with different
 * channels, all those rows become entries — shared `-o` then warns.
 */
export function collisionEntriesFromTableSelection(
  selectedNames: string[],
  rows: Array<{ recording: string; channel: number | null }>,
  fallbackChannel: number,
): Array<{ recordingStem: string; channel: number }> {
  const selectedStems = new Set(
    selectedNames.map((n) => predictRecordingStem(n)).filter(Boolean),
  );
  const fallback = Math.max(1, Math.floor(fallbackChannel) || 1);
  const entries: Array<{ recordingStem: string; channel: number }> = [];
  const stemsFromTable = new Set<string>();

  for (const row of rows) {
    const stem = predictRecordingStem(row.recording.trim());
    if (!stem || !selectedStems.has(stem)) continue;
    stemsFromTable.add(stem);
    const ch =
      row.channel != null && Number.isFinite(row.channel)
        ? Math.max(1, Math.floor(row.channel))
        : fallback;
    entries.push({ recordingStem: stem, channel: ch });
  }

  for (const stem of selectedStems) {
    if (!stemsFromTable.has(stem)) {
      entries.push({ recordingStem: stem, channel: fallback });
    }
  }
  return entries;
}

/** Channel from ``*_cN_*_predicted.txt``, else recording_table, else settings. */
export function channelFromPredictedPath(
  path: string | undefined | null,
): number | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/_c(\d+)_/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export function channelForQueueFile(
  file: { name: string; labelPath?: string; filteredPath?: string },
  rows: Array<{ recording: string; channel: number | null }>,
  fallbackChannel: number,
): number {
  const fromLabel =
    channelFromPredictedPath(file.filteredPath) ??
    channelFromPredictedPath(file.labelPath);
  if (fromLabel != null) return fromLabel;
  const map = channelMapFromRecordingTableRows(rows);
  return (
    map[file.name] ??
    map[predictRecordingStem(file.name)] ??
    Math.max(1, Math.floor(fallbackChannel) || 1)
  );
}

/** Custom ``-o`` that looks like a file (has an extension) + several WAV jobs. */
export function hasSharedOutputMultiFileRisk(args: {
  outputPath: string;
  fileCount: number;
}): boolean {
  const out = args.outputPath.trim();
  if (!out || out.toLowerCase() === "default") return false;
  if (args.fileCount <= 1) return false;
  return /\.[a-z0-9]+$/i.test(out);
}
