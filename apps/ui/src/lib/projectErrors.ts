import {
  errorText,
  formatUserFacingErrorRequired,
} from "./userFacingError";

export function isProjectNotFoundError(err: unknown): boolean {
  return /project not found/i.test(errorText(err));
}

export function formatProjectError(
  err: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (isProjectNotFoundError(err)) return t("projects.studio.offline.notFound");
  return formatUserFacingErrorRequired(err, t);
}
