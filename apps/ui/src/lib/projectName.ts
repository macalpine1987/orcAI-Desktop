import type { TFunction } from "i18next";
import type { ProjectNameConflict } from "../api/projects";

/**
 * Match sidecar `slugify` (project_registry.py): folder name derived from display name.
 */
export function slugifyProjectName(name: string): string {
  const raw = name.trim().toLowerCase();
  const replaced = raw.replace(/[^\p{L}\p{N}_]+/gu, "_");
  const collapsed = replaced.replace(/_+/g, "_").replace(/^_|_$/g, "");
  return collapsed || "project";
}

/** Last path segment of a project directory (POSIX or Windows). */
export function projectFolderName(projectPath: string): string {
  const normalized = projectPath.replace(/[/\\]+$/, "");
  const idx = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function projectNameConflictMessage(
  t: TFunction,
  requestedName: string,
  conflicts: ProjectNameConflict[],
): string {
  const orphan = conflicts.find((c) => c.reason === "directory" && c.suggest_register);
  if (orphan) {
    return t("projects.nameTakenSuggestRegister", {
      name: requestedName,
      path: orphan.path ?? "",
    });
  }
  const named = conflicts.find((c) => c.reason === "display_name");
  const existing = named?.display_name ?? conflicts[0]?.display_name;
  if (existing) {
    return t("projects.nameTakenWithExisting", {
      name: requestedName,
      existing,
    });
  }
  return t("projects.nameTaken", { name: requestedName });
}

export function projectNameFolderMismatchMessage(
  t: TFunction,
  folder: string,
): string {
  return t("projects.editModal.nameFolderMismatch", { folder });
}
