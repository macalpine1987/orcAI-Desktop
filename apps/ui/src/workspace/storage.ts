import type { FilterSettings, PredictSettings } from "./predictSettings";
import type { AnalysisPackage } from "./analysisPackages";
import type { ModelProfile } from "./predictModelProfiles";
import type { PredictQueue } from "./predictQueue";
import type { ProjectFocus, ProjectKind } from "../api/projects";

const WORKSPACE_KEY = "orcai-desktop.workspace";

/** Dispatched on every `saveWorkspace` in this tab. */
export const WORKSPACE_CHANGED_EVENT = "orcai-desktop.workspace-changed";

export type WorkspaceState = {
  activeProjectId: string | null;
  activeProjectKind: ProjectKind | null;
  /** Soft focus of the active project (`recognition` | `training` | `full`). */
  activeProjectFocus: ProjectFocus | null;
  projectDir: string | null;
  projectName: string | null;
  recordingTablePath: string | null;
  lastWavPath: string | null;
  lastLabelPath: string | null;
  lastCompareLabelPath: string | null;
  predictQueue: PredictQueue | null;
  /** Queue opened before a project was active (e.g. Open With while no project selected). */
  pendingPredictQueue: PredictQueue | null;
  predictSettings: PredictSettings | null;
  filterSettings: FilterSettings | null;
  predictModelProfiles: ModelProfile[] | null;
  activePredictProfileId: string | null;
  analysisPackages: AnalysisPackage[] | null;
  activeAnalysisPackageId: string | null;
};

const DEFAULT: WorkspaceState = {
  activeProjectId: null,
  activeProjectKind: null,
  activeProjectFocus: null,
  projectDir: null,
  projectName: null,
  recordingTablePath: null,
  lastWavPath: null,
  lastLabelPath: null,
  lastCompareLabelPath: null,
  predictQueue: null,
  pendingPredictQueue: null,
  predictSettings: null,
  filterSettings: null,
  predictModelProfiles: null,
  activePredictProfileId: null,
  analysisPackages: null,
  activeAnalysisPackageId: null,
};

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as WorkspaceState) } : { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveWorkspace(patch: Partial<WorkspaceState>): WorkspaceState {
  const next = { ...loadWorkspace(), ...patch };
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
  }
  return next;
}

/** First-launch workspace (no active project, empty queues). */
export function resetWorkspace(): WorkspaceState {
  try {
    localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
  }
  return { ...DEFAULT };
}
