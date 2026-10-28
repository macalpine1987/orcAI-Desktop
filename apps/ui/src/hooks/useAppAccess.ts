import { useSidecarStatus } from "./useSidecarStatus";
import { canAccessWorkSections, isDevUiPreviewUnlock } from "../lib/appAccess";

export function useSectionsAccessible(): boolean {
  const { engineReady, gracefulRuntimeRestart } = useSidecarStatus();
  if (isDevUiPreviewUnlock()) return true;
  return canAccessWorkSections(engineReady, gracefulRuntimeRestart);
}
