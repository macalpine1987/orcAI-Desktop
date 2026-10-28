/** Bridge: Predict page registers model-settings controls for the app header frames. */

import type { ProjectFocus } from "../api/projects";

export type ShellMetaFramesBridge = {
  /** When set, overrides workspace.projectName for the header frame. */
  projectNameOverride?: string | null;
  /**
   * `undefined` — use workspace predictSettings.model.
   * `null` — force empty/dash display when bridge needs it.
   * string — show this id (may be an absolute path for trained models).
   */
  modelIdOverride?: string | null;
  modelSettingsOpen?: boolean;
  onToggleModelSettings?: (() => void) | null;
};

/**
 * Header model readout: human name when known; never the full absolute path.
 * Trained models use path as settings `model` / API `id` — show basename (or
 * `resolvedName` from orcai_parameter) instead.
 */
export function shellModelDisplayLabel(
  modelId: string | null | undefined,
  resolvedName?: string | null,
): string | null {
  const named = resolvedName?.trim();
  if (named) return named;
  if (!modelId?.trim()) return null;
  const id = modelId.trim();
  if (id.includes("/") || id.includes("\\")) {
    const parts = id.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] ?? id;
  }
  return id;
}

let bridge: ShellMetaFramesBridge = {};
const listeners = new Set<() => void>();

export function setShellMetaFramesBridge(next: ShellMetaFramesBridge): void {
  bridge = next;
  listeners.forEach((fn) => fn());
}

export function clearShellMetaFramesBridge(): void {
  bridge = {};
  listeners.forEach((fn) => fn());
}

export function getShellMetaFramesBridge(): ShellMetaFramesBridge {
  return bridge;
}

export function subscribeShellMetaFramesBridge(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Project · Model · Engine header frames on every main screen (FR-1.7). */
export function shellMetaFramesVisible(_pathname: string): boolean {
  return true;
}

export function shellMetaEngineVisible(_pathname: string): boolean {
  return true;
}

/**
 * Second header frame (predict model): show for recognition / full-cycle focus,
 * always on Распознавание (`/predict*`), hide on the training pipeline board
 * (predict model is not what is being trained), hide for training focus and
 * with no project (except on `/predict*`).
 */
export function shellMetaModelVisible(opts: {
  pathname: string;
  hasActiveProject: boolean;
  focus: ProjectFocus | null | undefined;
}): boolean {
  const path = opts.pathname;
  if (path === "/predict" || path.startsWith("/predict/")) {
    return true;
  }
  // Pipeline / train wizard host — do not show the project's predict model.
  if (path === "/pipeline" || path.startsWith("/pipeline/")) {
    return false;
  }
  if (!opts.hasActiveProject) return false;
  return opts.focus === "recognition" || opts.focus === "full";
}
