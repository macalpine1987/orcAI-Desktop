/**
 * Wizard parent / catalog path helpers for Projects create flow (m32).
 */

/** Directory that contains an existing project folder. */
export function parentDirOfProject(projectPath: string): string {
  const normalized = projectPath.replace(/[/\\]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

/**
 * Parent folder for a new project.
 * A saved catalog wins. Otherwise stay next to the open project.
 * With neither, use the default root (the user home directory).
 */
export function initialWizardParent(args: {
  projectsRoot?: string | null;
  activeProjectPath?: string | null;
  fallbackRoot?: string | null;
}): string {
  const catalog = (args.projectsRoot ?? "").trim().replace(/[/\\]+$/, "");
  if (catalog) return catalog;
  const active = args.activeProjectPath?.trim();
  if (active) return parentDirOfProject(active);
  return (args.fallbackRoot ?? "").trim().replace(/[/\\]+$/, "");
}

/** Sidecar raises this when the wizard parent folder is not on disk. */
export function isMissingProjectParentError(message: string): boolean {
  return /parent directory not found/i.test(message);
}

/**
 * Saved catalog that no longer exists falls back to the home directory.
 * A folder the user picked in the dialog stays put, so the wizard can still
 * report that path.
 */
export function wizardParentWhenCatalogMissing(args: {
  parent: string;
  projectsRoot: string;
  fallbackRoot: string;
}): string | null {
  const strip = (value: string) => value.trim().replace(/[/\\]+$/, "");
  const parent = strip(args.parent);
  const catalog = strip(args.projectsRoot);
  const fallback = strip(args.fallbackRoot);
  if (!parent || !catalog || parent !== catalog) return null;
  if (!fallback || fallback === parent) return null;
  return fallback;
}

/** Suggested project folder for the wizard «Каталог» field (m32). */
export function wizardProjectDir(parentDir: string, slug: string): string {
  const parent = parentDir.replace(/[/\\]+$/, "");
  if (!parent) return "";
  const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return slug ? `${parent}${sep}${slug}` : parent;
}
