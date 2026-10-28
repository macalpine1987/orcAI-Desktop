import type { ProjectFocus, ProjectKind } from "../api/projects";

export type NavItemId =
  | "home"
  | "projects"
  | "predict"
  | "pipeline"
  | "models"
  | "results"
  | "jobs"
  | "settings"
  | "help";

export type NavItem = {
  id: NavItemId;
  path: string;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "home", path: "/" },
  { id: "projects", path: "/projects" },
  { id: "predict", path: "/predict" },
  { id: "pipeline", path: "/pipeline" },
  { id: "models", path: "/models" },
  { id: "results", path: "/results" },
  { id: "jobs", path: "/jobs" },
  { id: "settings", path: "/settings" },
  { id: "help", path: "/help" },
];

export function visibleNav(): NavItem[] {
  return NAV_ITEMS;
}

export type ShellFocusInput = {
  activeProjectId: string | null;
  projectDir: string | null;
  activeProjectFocus: ProjectFocus | null;
  activeProjectKind: ProjectKind | null;
};

/**
 * Focus used by the shell. An explicit focus wins. A project saved before
 * focus existed falls back to kind: training stays training, anything else
 * is recognition. No active project leaves the focus unset.
 */
export function resolveShellFocus(
  workspace: ShellFocusInput,
): ProjectFocus | null {
  const focus = workspace.activeProjectFocus;
  if (focus === "recognition" || focus === "training" || focus === "full") {
    return focus;
  }
  const hasProject = Boolean(workspace.activeProjectId && workspace.projectDir);
  if (!hasProject) return null;
  return workspace.activeProjectKind === "training" ? "training" : "recognition";
}

/**
 * Sidebar «Обучение» stays visible, but is not clickable for a
 * recognition-only project. Training and full-cycle focuses keep it active.
 * No active project does not disable the item.
 */
export function pipelineNavInactive(
  focus: ProjectFocus | null | undefined,
): boolean {
  return focus === "recognition";
}

export function pipelineNavInactiveForWorkspace(
  workspace: ShellFocusInput,
): boolean {
  return pipelineNavInactive(resolveShellFocus(workspace));
}
