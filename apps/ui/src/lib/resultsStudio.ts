import type { ResultsClassBucket, ResultsSource, ResultsSummaryRow } from "../api/results";
import { sortLabelsForLegend } from "./labelColors";

export type ResultsTableFilters = {
  recording: string;
  classLabel: string;
  minProb: number | null;
  fileQuery: string;
  minDuration: number | null;
  maxDuration: number | null;
};

export type ResultsSortKey =
  | "recording"
  | "start_sec"
  | "stop_sec"
  | "duration_sec"
  | "label"
  | "type"
  | "mean_p"
  | "kind";

export type ResultsSort = {
  key: ResultsSortKey;
  dir: "asc" | "desc";
};

/** Default table order: filename, then start time within a file (m06). */
export const DEFAULT_RESULTS_SORT: ResultsSort = { key: "recording", dir: "asc" };

export const EMPTY_RESULTS_FILTERS: ResultsTableFilters = {
  recording: "",
  classLabel: "",
  minProb: null,
  fileQuery: "",
  minDuration: null,
  maxDuration: null,
};

/**
 * Seed «Вероятность ≥» only for predicted files: they already passed orcAI `-th`.
 * `filter-predictions` is duration-only, so filtered/annotations stay unseeded.
 */
export function seedResultsMinProb(
  source: ResultsSource,
  thresholds: number[],
): number | null {
  if (source !== "predicted") return null;
  const first = thresholds[0];
  return first == null ? null : first;
}

/** Class chart keeps every file-filtered class; a selected class stays visible at count 0. */
export function classChartColumns(
  classes: ResultsClassBucket[],
  selectedLabel = "",
): ResultsClassBucket[] {
  const byLabel = new Map(classes.map((item) => [item.label, item]));
  if (selectedLabel && !byLabel.has(selectedLabel)) {
    byLabel.set(selectedLabel, {
      label: selectedLabel,
      count: 0,
      duration_sec: 0,
    });
  }
  return sortLabelsForLegend([...byLabel.keys()])
    .map((label) => byLabel.get(label))
    .filter((item): item is ResultsClassBucket => Boolean(item));
}

export function filterResultsRows(
  rows: ResultsSummaryRow[],
  filters: ResultsTableFilters,
): ResultsSummaryRow[] {
  return rows.filter((row) => {
    if (filters.recording && row.recording !== filters.recording) return false;
    if (filters.classLabel && row.label !== filters.classLabel) return false;
    if (filters.fileQuery.trim()) {
      const q = filters.fileQuery.trim().toLowerCase();
      if (!row.recording.toLowerCase().includes(q)) return false;
    }
    if (filters.minProb != null) {
      if (row.mean_p == null) {
        // Annotations have no mean_p — a predict threshold must not hide them.
        if (row.kind !== "annotation") return false;
      } else if (row.mean_p < filters.minProb) {
        return false;
      }
    }
    if (filters.minDuration != null && row.duration_sec < filters.minDuration) {
      return false;
    }
    if (filters.maxDuration != null && row.duration_sec > filters.maxDuration) {
      return false;
    }
    return true;
  });
}

export type ResultsVisibleSummary = {
  detection_count: number;
  recording_count: number;
  duration_sec: number;
  mean_p: number | null;
  classes: ResultsClassBucket[];
};

/** KPI + class bars for the currently filtered table (not the unfiltered sidecar totals). */
export function summarizeResultsRows(rows: ResultsSummaryRow[]): ResultsVisibleSummary {
  const classCounts = new Map<string, ResultsClassBucket>();
  const recordings = new Set<string>();
  let durationSec = 0;
  const probs: number[] = [];
  for (const row of rows) {
    recordings.add(row.recording);
    durationSec += row.duration_sec;
    if (row.mean_p != null && Number.isFinite(row.mean_p)) probs.push(row.mean_p);
    const bucket = classCounts.get(row.label) ?? {
      label: row.label,
      count: 0,
      duration_sec: 0,
    };
    bucket.count += 1;
    bucket.duration_sec += row.duration_sec;
    classCounts.set(row.label, bucket);
  }
  return {
    detection_count: rows.length,
    recording_count: recordings.size,
    duration_sec: durationSec,
    mean_p: probs.length ? probs.reduce((sum, value) => sum + value, 0) / probs.length : null,
    classes: [...classCounts.values()],
  };
}

export function sortResultsRows(
  rows: ResultsSummaryRow[],
  sort: ResultsSort,
  typeLabelFor: (label: string) => string,
): ResultsSummaryRow[] {
  const copy = [...rows];
  const dir = sort.dir === "asc" ? 1 : -1;
  copy.sort((a, b) => {
    const primary = compareSortValue(
      sortValue(a, sort.key, typeLabelFor),
      sortValue(b, sort.key, typeLabelFor),
      dir,
    );
    if (primary !== 0) return primary;
    if (sort.key !== "recording") {
      const byName = compareSortValue(a.recording, b.recording, 1);
      if (byName !== 0) return byName;
    }
    const byStart = a.start_sec - b.start_sec;
    if (byStart !== 0) return byStart;
    const byStop = a.stop_sec - b.stop_sec;
    if (byStop !== 0) return byStop;
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
  });
  return copy;
}

function compareSortValue(
  av: string | number,
  bv: string | number,
  dir: number,
): number {
  if (typeof av === "number" && typeof bv === "number") {
    return (av - bv) * dir;
  }
  return (
    String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir
  );
}

function sortValue(
  row: ResultsSummaryRow,
  key: ResultsSortKey,
  typeLabelFor: (label: string) => string,
): string | number {
  if (key === "type") return typeLabelFor(row.label);
  if (key === "label") return row.label;
  if (key === "recording") return row.recording;
  if (key === "mean_p") return row.mean_p ?? -1;
  if (key === "kind") return row.kind ?? "";
  return row[key];
}

export function toggleResultsSort(
  current: ResultsSort,
  key: ResultsSortKey,
): ResultsSort {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: key === "start_sec" || key === "recording" ? "asc" : "desc" };
}

export function rowsToCsv(
  rows: ResultsSummaryRow[],
  typeLabelFor: (label: string) => string,
): string {
  const header = [
    "recording",
    "class",
    "type",
    "start_sec",
    "stop_sec",
    "duration_sec",
    "mean_p",
    "model",
    "kind",
    "label_path",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.recording),
        csvCell(row.label),
        csvCell(typeLabelFor(row.label)),
        csvCell(row.start_sec),
        csvCell(row.stop_sec),
        csvCell(row.duration_sec),
        csvCell(row.mean_p),
        csvCell(row.model),
        csvCell(row.kind),
        csvCell(row.label_path),
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function rowsToAudacityText(rows: ResultsSummaryRow[]): string {
  const ordered = [...rows].sort(
    (a, b) => a.start_sec - b.start_sec || a.stop_sec - b.stop_sec,
  );
  const lines = ordered.map((row) => {
    const label = row.label.replace(/\t/g, " ");
    return `${row.start_sec.toFixed(9)}\t${row.stop_sec.toFixed(9)}\t${label}`;
  });
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function groupRowsByRecording(
  rows: ResultsSummaryRow[],
): Map<string, ResultsSummaryRow[]> {
  const map = new Map<string, ResultsSummaryRow[]>();
  for (const row of rows) {
    const key = audacityGroupKey(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

export function audacityGroupKey(row: {
  recording: string;
  kind?: string | null;
  model?: string | null;
}): string {
  return [row.recording, row.kind || "", row.model || ""].join("\0");
}

export function suggestedAudacityName(
  recording: string,
  kind?: string | null,
  model?: string | null,
): string {
  const stem = recording.replace(/\.wav$/i, "");
  const extra = [kind, model].filter((part) => Boolean(part && String(part).trim()));
  return extra.length
    ? `${stem}_${extra.join("_")}_audacity.txt`
    : `${stem}_audacity.txt`;
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function formatResultsMeanP(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

export function formatResultsThresholds(values: number[]): string {
  if (values.length === 0) return "—";
  return values.map((v) => v.toFixed(2)).join(" / ");
}

export function formatResultsModels(values: string[]): string {
  if (values.length === 0) return "—";
  return values.join(" · ");
}

export function formatKpiDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function probabilityBarTone(meanP: number | null | undefined): "high" | "mid" | "none" {
  if (meanP == null || !Number.isFinite(meanP)) return "none";
  return meanP >= 0.75 ? "high" : "mid";
}

export type DetectionFocusNav = {
  t0: number;
  t1: number;
  label?: string;
  nonce: string;
};

/**
 * Keep a Results→Analysis label override until the nav WAV is active.
 * Clearing earlier races with the persisted queue still showing another file.
 */
export function shouldKeepNavLabelOverride(opts: {
  navLabel?: string;
  navWav?: string;
  activeWav?: string | null;
  matchedNavWav: boolean;
}): { keep: boolean; matched: boolean } {
  if (!opts.navLabel) return { keep: false, matched: false };
  if (!opts.navWav) return { keep: true, matched: opts.matchedNavWav };
  if (opts.activeWav && opts.activeWav === opts.navWav) {
    return { keep: true, matched: true };
  }
  if (!opts.matchedNavWav) return { keep: true, matched: false };
  return { keep: false, matched: true };
}
