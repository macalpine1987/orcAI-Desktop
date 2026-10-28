import type { NavItemId } from "../layout/navigation";

/** Routes always available without sidecar/engine. */
export const RUNTIME_FREE_NAV_IDS = new Set<NavItemId>([
  "home",
  "settings",
  "help",
]);

export function isRuntimeFreeNavId(id: NavItemId): boolean {
  return RUNTIME_FREE_NAV_IDS.has(id);
}

/** Normalize pathname for route checks (no trailing slash). */
export function normalizeAppPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function isRuntimeFreePath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === "/" || path === "/settings" || path === "/help";
}

/**
 * Work sections (everything except Home / Settings / Help) require a ready engine,
 * unless a CPU↔GPU runtime restart is in progress (grace period).
 */
export function canAccessWorkSections(
  engineReady: boolean,
  gracefulRuntimeRestart: boolean,
): boolean {
  return engineReady || gracefulRuntimeRestart;
}

/** DEV-only: `?unlock=1` opens work sections without sidecar (UI screenshots / layout). */
export function isDevUiPreviewUnlock(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("unlock") === "1";
  } catch {
    return false;
  }
}
