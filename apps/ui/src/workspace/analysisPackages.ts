import type { ModelProfileSettings } from "./predictModelProfiles";
import {
  normalizeProfileSettings,
  settingsFromPredictSettings,
} from "./predictModelProfiles";
import type { PredictSettings } from "./predictSettings";
import { loadWorkspace, saveWorkspace } from "./storage";
import { predictQueueAudioFiles, type PredictQueue } from "./predictQueue";
import {
  countPredictRunnable,
  predictFileNeedsOverwrite,
  predictFilesToRun,
  predictRunBreakdown,
  selectedFileNamesForRun,
} from "../lib/predictBatch";

export type AnalysisPackage = {
  id: string;
  name: string;
  projectId: string;
  fileNames: string[];
  settings: ModelProfileSettings;
  sourceProfileId?: string;
  createdAt: number;
  updatedAt: number;
};

function newId(): string {
  return `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadAnalysisPackages(): AnalysisPackage[] {
  const ws = loadWorkspace();
  const raw = ws.analysisPackages;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => normalizePackage(p))
    .filter((p): p is AnalysisPackage => p != null);
}

export function packagesForProject(
  packages: AnalysisPackage[],
  projectId: string,
): AnalysisPackage[] {
  return packages.filter((p) => p.projectId === projectId);
}

export function loadActiveAnalysisPackageId(): string | null {
  return loadWorkspace().activeAnalysisPackageId;
}

export function persistAnalysisPackages(
  packages: AnalysisPackage[],
  activePackageId: string | null,
): void {
  saveWorkspace({
    analysisPackages: packages,
    activeAnalysisPackageId: activePackageId,
  });
}

function normalizePackage(raw: unknown): AnalysisPackage | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<AnalysisPackage>;
  if (typeof p.id !== "string" || typeof p.name !== "string") return null;
  if (typeof p.projectId !== "string") return null;
  if (!Array.isArray(p.fileNames)) return null;
  return {
    id: p.id,
    name: p.name.trim() || "Package",
    projectId: p.projectId,
    fileNames: p.fileNames.filter((n): n is string => typeof n === "string"),
    settings: normalizeProfileSettings(p.settings),
    sourceProfileId:
      typeof p.sourceProfileId === "string" ? p.sourceProfileId : undefined,
    createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
  };
}

export function getAnalysisPackage(
  packages: AnalysisPackage[],
  id: string,
): AnalysisPackage | undefined {
  return packages.find((p) => p.id === id);
}

export function resolveActivePackageForProject(
  packages: AnalysisPackage[],
  projectId: string,
  activeId: string | null,
): AnalysisPackage | undefined {
  const scoped = packagesForProject(packages, projectId);
  if (!activeId) return undefined;
  return scoped.find((p) => p.id === activeId);
}

/** File names still present in the project queue. */
export function resolvePackageFileNames(
  queue: PredictQueue,
  pkg: AnalysisPackage,
): string[] {
  const inQueue = new Set(predictQueueAudioFiles(queue).map((f) => f.name));
  return pkg.fileNames.filter((n) => inQueue.has(n));
}

export function formatPackageSubtitle(
  pkg: AnalysisPackage,
  resolvedFileCount: number,
): string {
  const ch = Math.max(1, Math.floor(pkg.settings.channel) || 1);
  return `${resolvedFileCount} · ${pkg.settings.model} · ${pkg.settings.threshold.toFixed(2)} · ch${ch}`;
}

export function createAnalysisPackage(
  packages: AnalysisPackage[],
  input: {
    name: string;
    projectId: string;
    fileNames: string[];
    settings: ModelProfileSettings | PredictSettings;
    sourceProfileId?: string;
  },
): { packages: AnalysisPackage[]; pkg: AnalysisPackage } {
  const now = Date.now();
  const settings =
    "callDurationLimitsProjectDir" in input.settings ||
    "additionalOpen" in input.settings
      ? settingsFromPredictSettings(input.settings as PredictSettings)
      : normalizeProfileSettings(input.settings as ModelProfileSettings);
  const pkg: AnalysisPackage = {
    id: newId(),
    name: input.name.trim() || "Package",
    projectId: input.projectId,
    fileNames: [...new Set(input.fileNames)],
    settings,
    sourceProfileId: input.sourceProfileId,
    createdAt: now,
    updatedAt: now,
  };
  return { packages: [...packages, pkg], pkg };
}

export function upsertAnalysisPackage(
  packages: AnalysisPackage[],
  pkg: AnalysisPackage,
): AnalysisPackage[] {
  const idx = packages.findIndex((p) => p.id === pkg.id);
  if (idx < 0) return [...packages, pkg];
  const next = [...packages];
  next[idx] = pkg;
  return next;
}

export function updateAnalysisPackage(
  packages: AnalysisPackage[],
  id: string,
  patch: Partial<
    Pick<AnalysisPackage, "name" | "fileNames" | "settings" | "sourceProfileId">
  >,
): AnalysisPackage[] {
  const current = getAnalysisPackage(packages, id);
  if (!current) return packages;
  const updated: AnalysisPackage = {
    ...current,
    ...patch,
    name: patch.name?.trim() ? patch.name.trim() : current.name,
    fileNames: patch.fileNames ? [...new Set(patch.fileNames)] : current.fileNames,
    settings: patch.settings
      ? normalizeProfileSettings(patch.settings)
      : current.settings,
    updatedAt: Date.now(),
  };
  return upsertAnalysisPackage(packages, updated);
}

export function renameAnalysisPackage(
  packages: AnalysisPackage[],
  id: string,
  name: string,
): AnalysisPackage[] {
  return updateAnalysisPackage(packages, id, { name });
}

export function deleteAnalysisPackage(
  packages: AnalysisPackage[],
  id: string,
): AnalysisPackage[] {
  return packages.filter((p) => p.id !== id);
}

/** True when recognition output likely exists and predict must allow overwrite. */
export const packageFileNeedsOverwrite = predictFileNeedsOverwrite;

/** WAV rows from the package eligible for predict in this run (excludes running). */
export const packageFilesToAnalyze = predictFilesToRun;

export function countPackageRunnable(
  queue: PredictQueue,
  fileNames: string[],
): number {
  return countPredictRunnable(queue, fileNames);
}

/** Names to save when forming a package from the file-selection table. */
export const fileNamesForNewPackage = selectedFileNamesForRun;

/** Split package queue into first-run vs re-run (overwrite) files. */
export const packageRunBreakdown = predictRunBreakdown;
