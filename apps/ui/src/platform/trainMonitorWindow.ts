import { LogicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauriRuntime } from "../api/sidecarControl";
import { TRAIN_MONITOR_WINDOW_LABEL } from "./shellWindow";
import { silentCatch } from "../lib/silentCatch";

const GEOM_KEY = "orcai-desktop.train-monitor-window";

/** Fixed OS window title (all locales) — no phase / model / project suffix. */
export const TRAIN_MONITOR_WINDOW_TITLE = "orcAI - train";

type WindowGeom = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

/**
 * Floor where the wide monitor layout fits without window scrollbars.
 * Must stay above the ``max-width: 1100px`` stack breakpoint in train-monitor.css
 * (below that, KPI wraps to 2 rows and mid stacks → vertical scroll).
 */
export const TRAIN_MONITOR_MIN_WIDTH = 1120;
export const TRAIN_MONITOR_MIN_HEIGHT = 720;
const DEFAULT_WIDTH = TRAIN_MONITOR_MIN_WIDTH;
const DEFAULT_HEIGHT = TRAIN_MONITOR_MIN_HEIGHT;

function clampGeom(geom: WindowGeom): WindowGeom {
  return {
    width: Math.max(TRAIN_MONITOR_MIN_WIDTH, Math.round(geom.width)),
    height: Math.max(TRAIN_MONITOR_MIN_HEIGHT, Math.round(geom.height)),
    x: typeof geom.x === "number" ? Math.round(geom.x) : undefined,
    y: typeof geom.y === "number" ? Math.round(geom.y) : undefined,
  };
}

function readGeom(): WindowGeom | null {
  try {
    const raw = localStorage.getItem(GEOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WindowGeom;
    if (
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      !Number.isFinite(parsed.width) ||
      !Number.isFinite(parsed.height)
    ) {
      return null;
    }
    return clampGeom(parsed);
  } catch (err) {
          silentCatch("trainMonitorWindow")(err);
    return null;
  }
}

/** Persist outer size/position from the monitor window itself. */
export async function persistTrainMonitorWindowGeom(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const win = WebviewWindow.getCurrent();
    if (win.label !== TRAIN_MONITOR_WINDOW_LABEL) return;
    const size = await win.outerSize();
    const pos = await win.outerPosition();
    const factor = await win.scaleFactor();
    const geom = clampGeom({
      width: size.width / factor,
      height: size.height / factor,
      x: pos.x / factor,
      y: pos.y / factor,
    });
    localStorage.setItem(GEOM_KEY, JSON.stringify(geom));
  } catch (err) {
          silentCatch("trainMonitorWindow")(err);
    // best-effort
  }
}

function monitorUrl(projectId?: string | null): string {
  const q = new URLSearchParams();
  if (projectId) q.set("project", projectId);
  const qs = q.toString();
  return qs ? `/train-monitor?${qs}` : "/train-monitor";
}

/** B-Scope training-monitor mark (bundled PNG, same optical size as the Lab icon). */
async function applyTrainMonitorIcon(win: WebviewWindow): Promise<void> {
  try {
    const res = await fetch("/train-monitor-icon.png");
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      await win.setIcon(bytes);
      return;
    }
  } catch (err) {
          silentCatch("trainMonitorWindow")(err);
    /* try resource path */
  }
  try {
    const { join, resourceDir } = await import("@tauri-apps/api/path");
    const path = await join(await resourceDir(), "icons", "train-monitor.png");
    await win.setIcon(path);
  } catch (err) {
          silentCatch("trainMonitorWindow")(err);
    /* icon is best-effort */
  }
}

/**
 * Keep the window at/above the no-scrollbar floor (wide layout, not stacked).
 */
async function ensureTrainMonitorFloor(win: WebviewWindow): Promise<void> {
  try {
    await win.setMinSize(
      new LogicalSize(TRAIN_MONITOR_MIN_WIDTH, TRAIN_MONITOR_MIN_HEIGHT),
    );
  } catch (err) {
          silentCatch("trainMonitorWindow")(err);
    /* min size optional on some hosts */
  }
  try {
    const size = await win.outerSize();
    const factor = await win.scaleFactor();
    const width = size.width / factor;
    const height = size.height / factor;
    if (width + 0.5 < TRAIN_MONITOR_MIN_WIDTH || height + 0.5 < TRAIN_MONITOR_MIN_HEIGHT) {
      await win.setSize(
        new LogicalSize(
          Math.max(TRAIN_MONITOR_MIN_WIDTH, Math.round(width)),
          Math.max(TRAIN_MONITOR_MIN_HEIGHT, Math.round(height)),
        ),
      );
    }
  } catch (err) {
          silentCatch("trainMonitorWindow")(err);
    /* resize optional */
  }
}

/**
 * Open or focus the detached training-monitor window.
 * Outside Tauri, navigates the current tab to `/train-monitor`.
 */
export async function openOrFocusTrainMonitorWindow(options?: {
  projectId?: string | null;
}): Promise<void> {
  const title = TRAIN_MONITOR_WINDOW_TITLE;
  const url = monitorUrl(options?.projectId);

  if (!isTauriRuntime()) {
    window.location.assign(url);
    return;
  }

  const existing = await WebviewWindow.getByLabel(TRAIN_MONITOR_WINDOW_LABEL);
  if (existing) {
    try {
      await existing.setSkipTaskbar(false);
    } catch (err) {
      silentCatch("trainMonitorWindow")(err);
    }
    try {
      const { emitTo } = await import("@tauri-apps/api/event");
      await emitTo(TRAIN_MONITOR_WINDOW_LABEL, "orcai-train-monitor-show", {
        projectId: options?.projectId ?? null,
      });
    } catch (err) {
      silentCatch("trainMonitorWindow")(err);
    }
    try {
      await existing.show();
    } catch (err) {
      silentCatch("trainMonitorWindow")(err);
      /* already visible */
    }
    try {
      await existing.setFocus();
    } catch (err) {
      silentCatch("trainMonitorWindow")(err);
      /* focus optional */
    }
    try {
      await existing.setTitle(title);
    } catch (err) {
      silentCatch("trainMonitorWindow")(err);
      /* title optional */
    }
    await ensureTrainMonitorFloor(existing);
    void applyTrainMonitorIcon(existing);
    return;
  }

  const geom = readGeom();
  const opts: ConstructorParameters<typeof WebviewWindow>[1] = {
    url,
    title,
    width: geom?.width ?? DEFAULT_WIDTH,
    height: geom?.height ?? DEFAULT_HEIGHT,
    minWidth: TRAIN_MONITOR_MIN_WIDTH,
    minHeight: TRAIN_MONITOR_MIN_HEIGHT,
    resizable: true,
    focus: true,
    visible: true,
  };
  if (geom?.x != null && geom?.y != null) {
    opts.x = geom.x;
    opts.y = geom.y;
  }

  const win = await new Promise<WebviewWindow>((resolve, reject) => {
    const created = new WebviewWindow(TRAIN_MONITOR_WINDOW_LABEL, opts);
    created.once("tauri://created", () => resolve(created));
    created.once("tauri://error", (event) => {
      reject(
        new Error(
          typeof event.payload === "string"
            ? event.payload
            : "Failed to open training monitor window",
        ),
      );
    });
  });
  await ensureTrainMonitorFloor(win);
  await applyTrainMonitorIcon(win);
}
export async function closeTrainMonitorWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    window.history.back();
    return;
  }
  await persistTrainMonitorWindowGeom();
  const win = WebviewWindow.getCurrent();
  try {
    await win.hide();
    try {
      await win.setSkipTaskbar(true);
    } catch (err) {
      silentCatch("trainMonitorWindow")(err);
    }
  } catch (err) {
    silentCatch("trainMonitorWindow")(err);
    try {
      await win.destroy();
    } catch (destroyErr) {
      silentCatch("trainMonitorWindow")(destroyErr);
      await win.close();
    }
  }
}
