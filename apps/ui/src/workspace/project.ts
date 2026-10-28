import type { ProjectFocus, ProjectRecord } from "../api/projects";
import { updateProject } from "../api/projects";
import { joinFsPath } from "../lib/joinFsPath";
import { normalizeProjectKind } from "../lib/projectKind";
import {
  publishClearedActiveProjectNotice,
  type ClearedActiveProjectNotice,
} from "./clearedActiveProjectNotice";
import {
  DEFAULT_PREDICT_SETTINGS,
  loadPredictSettings,
  savePredictSettings,
} from "./predictSettings";
import { loadWorkspace, saveWorkspace, type WorkspaceState } from "./storage";

/** Soft focus for shell chrome; falls back from kind when focus is unset. */
export function resolveActiveProjectFocus(
  project: Pick<ProjectRecord, "focus" | "project_kind">,
): ProjectFocus {
  const focus = project.focus;
  if (focus === "recognition" || focus === "training" || focus === "full") {
    return focus;
  }
  return normalizeProjectKind(project.project_kind) === "training"
    ? "training"
    : "recognition";
}

export function defaultRecordingTablePath(projectDir: string): string {
  return joinFsPath(projectDir, "recording_table.csv");
}

export function defaultRecordingsDir(projectDir: string): string {
  return joinFsPath(projectDir, "recordings");
}

/** Apply the project's saved predict model into workspace settings. */
export function applyPredictModelFromProject(
  project: ProjectRecord,
  opts?: { resetIfMissing?: boolean },
): void {
  const model = project.predict_model?.trim();
  if (model) {
    savePredictSettings({
      model,
      modelDir: project.predict_model_dir?.trim() || undefined,
    });
    return;
  }
  if (!opts?.resetIfMissing) return;
  // loadPredictSettings() returns the default builtin when workspace has never
  // persisted predictSettings — still write so the shell header model frame
  // (workspace.predictSettings?.model) is not empty until the user re-picks.
  const ws = loadWorkspace();
  const current = loadPredictSettings();
  if (
    ws.predictSettings != null &&
    current.model === DEFAULT_PREDICT_SETTINGS.model &&
    !current.modelDir
  ) {
    return;
  }
  savePredictSettings({
    model: DEFAULT_PREDICT_SETTINGS.model,
    modelDir: undefined,
  });
}

/**
 * Persist the selected predict model for the active project (sidecar settings file).
 * Also updates local workspace predict settings.
 */
export async function persistActiveProjectPredictModel(
  model: string,
  modelDir?: string | null,
): Promise<ProjectRecord | null> {
  const trimmed = model.trim();
  if (!trimmed) return null;
  const dir = modelDir?.trim() || null;
  savePredictSettings({
    model: trimmed,
    modelDir: dir || undefined,
  });
  const ws = loadWorkspace();
  if (!ws.activeProjectId) return null;
  return updateProject(ws.activeProjectId, {
    predict_model: trimmed,
    predict_model_dir: dir,
  });
}

export function applyActiveProject(project: ProjectRecord): void {
  saveWorkspace({
    activeProjectId: project.id,
    activeProjectKind: normalizeProjectKind(project.project_kind),
    activeProjectFocus: resolveActiveProjectFocus(project),
    projectDir: project.path,
    /** Human-readable label for Home / shell (P2-08). */
    projectName: project.display_name || project.orcai_name,
    recordingTablePath: project.recording_table_path ?? null,
  });
  applyPredictModelFromProject(project, { resetIfMissing: true });
}

/** Persist focus change for the active project (header model frame depends on it). */
export function applyActiveProjectFocus(focus: ProjectFocus): void {
  const ws = loadWorkspace();
  if (!ws.activeProjectId) return;
  if (ws.activeProjectFocus === focus) return;
  saveWorkspace({ activeProjectFocus: focus });
}

export function clearActiveProjectIf(
  id: string,
  opts?: { notice?: boolean },
): ClearedActiveProjectNotice | null {
  const ws = loadWorkspace();
  if (ws.activeProjectId !== id) return null;
  const notice: ClearedActiveProjectNotice = {
    path: ws.projectDir,
    name: ws.projectName,
  };
  saveWorkspace({
    activeProjectId: null,
    activeProjectKind: null,
    activeProjectFocus: null,
    projectDir: null,
    projectName: null,
    recordingTablePath: null,
  });
  if (opts?.notice) {
    publishClearedActiveProjectNotice(notice);
  }
  return notice;
}

/**
 * Drop workspace project pointers when the project vanished from disk/registry.
 * Returns notice payload when the previous active project was cleared.
 */
export function reconcileWorkspaceWithProjects(
  projects: ProjectRecord[],
): ClearedActiveProjectNotice | null {
  const ws = loadWorkspace();
  const patch: Partial<WorkspaceState> = {};
  let cleared: ClearedActiveProjectNotice | null = null;

  if (ws.activeProjectId) {
    const active = projects.find((p) => p.id === ws.activeProjectId);
    if (!active) {
      cleared = {
        path: ws.projectDir,
        name: ws.projectName,
      };
      patch.activeProjectId = null;
      patch.activeProjectKind = null;
      patch.activeProjectFocus = null;
      patch.projectDir = null;
      patch.projectName = null;
      patch.recordingTablePath = null;
    } else {
      const kind = normalizeProjectKind(active.project_kind);
      const focus = resolveActiveProjectFocus(active);
      const label = active.display_name || active.orcai_name;
      if (ws.projectDir !== active.path) patch.projectDir = active.path;
      if (ws.projectName !== label) patch.projectName = label;
      if (ws.activeProjectKind !== kind) patch.activeProjectKind = kind;
      if (ws.activeProjectFocus !== focus) patch.activeProjectFocus = focus;
      const table = active.recording_table_path ?? null;
      if (ws.recordingTablePath !== table) patch.recordingTablePath = table;
      applyPredictModelFromProject(active, { resetIfMissing: true });
    }
  } else if (
    ws.projectDir &&
    !projects.some((p) => p.path === ws.projectDir)
  ) {
    cleared = {
      path: ws.projectDir,
      name: ws.projectName,
    };
    patch.projectDir = null;
    patch.projectName = null;
    patch.recordingTablePath = null;
    patch.activeProjectKind = null;
    patch.activeProjectFocus = null;
  }

  if (Object.keys(patch).length > 0) {
    saveWorkspace(patch);
  }
  if (cleared) {
    publishClearedActiveProjectNotice(cleared);
  }
  return cleared;
}
