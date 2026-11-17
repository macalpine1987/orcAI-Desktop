import type { DetectionSelection } from "./spectrogramDetections";
import {
  spectrogramSegmentIndexForStart,
  spectrogramSegmentWindow,
} from "./spectrogramView";

const VIEW_KEY = "orcai-spectrogram-view";
const VOLUME_KEY = "orcai-spectrogram-volume";
const MAX_VIEWS = 40;

export type RememberedSpectrogramView = {
  viewStart: number;
  viewSpan: number;
  playheadSec: number;
  selected: DetectionSelection | null;
};

type ViewMap = Record<string, RememberedSpectrogramView>;

/** Scope remembered playhead/window per project so a new project starts at 0. */
export function spectrogramViewStorageKey(
  projectScope: string | null | undefined,
  wavPath: string,
): string {
  const scope = (projectScope ?? "").trim();
  return scope ? `${scope}\0${wavPath}` : wavPath;
}

function readViews(): ViewMap {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ViewMap;
  } catch {
    return {};
  }
}

function writeViews(map: ViewMap): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

function isSelection(value: unknown): value is DetectionSelection {
  if (!value || typeof value !== "object") return false;
  const row = value as DetectionSelection;
  return Number.isFinite(row.t0) && Number.isFinite(row.t1);
}

function isRememberedView(value: unknown): value is RememberedSpectrogramView {
  if (!value || typeof value !== "object") return false;
  const row = value as RememberedSpectrogramView;
  return (
    Number.isFinite(row.viewStart) &&
    Number.isFinite(row.viewSpan) &&
    row.viewSpan > 0 &&
    Number.isFinite(row.playheadSec) &&
    (row.selected == null || isSelection(row.selected))
  );
}

export function rememberSpectrogramView(
  wavPath: string,
  view: RememberedSpectrogramView,
  projectScope?: string | null,
): void {
  if (!wavPath) return;
  const key = spectrogramViewStorageKey(projectScope, wavPath);
  const map = readViews();
  if (key in map) delete map[key];
  map[key] = view;
  const keys = Object.keys(map);
  while (keys.length > MAX_VIEWS) {
    const oldest = keys.shift();
    if (oldest) delete map[oldest];
  }
  writeViews(map);
}

export function clearRememberedSpectrogramView(
  wavPath: string,
  projectScope?: string | null,
): void {
  const key = spectrogramViewStorageKey(projectScope, wavPath);
  const map = readViews();
  if (!(key in map)) return;
  delete map[key];
  writeViews(map);
}

export function resolveSpectrogramRememberedView(
  wavPath: string,
  durationSec: number,
  projectScope?: string | null,
): RememberedSpectrogramView & { segmentIndex: number } {
  const fresh = spectrogramSegmentWindow(0, durationSec);
  const empty = {
    segmentIndex: fresh.segmentIndex,
    viewStart: fresh.viewStart,
    viewSpan: fresh.viewSpan,
    playheadSec: 0,
    selected: null as DetectionSelection | null,
  };
  if (!(durationSec > 0)) return empty;
  // Project-scoped only — no bare-path fallback, so a new project never
  // inherits another project's mid-file playhead for the same WAV path.
  const stored = readViews()[spectrogramViewStorageKey(projectScope, wavPath)];
  if (!isRememberedView(stored)) return empty;

  const viewSpan = Math.min(stored.viewSpan, durationSec);
  const maxStart = Math.max(0, durationSec - viewSpan);
  const viewStart = Math.max(0, Math.min(stored.viewStart, maxStart));
  let playheadSec = Math.max(0, Math.min(stored.playheadSec, durationSec));
  const windowEnd = viewStart + viewSpan;
  if (playheadSec < viewStart || playheadSec > windowEnd) {
    playheadSec = viewStart;
  }
  return {
    segmentIndex: spectrogramSegmentIndexForStart(viewStart, durationSec),
    viewStart,
    viewSpan,
    playheadSec,
    selected: stored.selected,
  };
}

export function loadRememberedStudioVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null || raw === "") return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  } catch {
    return 1;
  }
}

export function rememberStudioVolume(volume: number): void {
  if (!Number.isFinite(volume)) return;
  try {
    localStorage.setItem(
      VOLUME_KEY,
      String(Math.max(0, Math.min(1, volume))),
    );
  } catch {
    /* private mode */
  }
}
