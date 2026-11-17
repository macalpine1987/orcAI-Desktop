import { isAnnotationPath, isPredictExportPath } from "./annotationDrop";
import { basename } from "../platform/dialog";
import { formatWavOnlyImportError, isWavFileName } from "./wizardImportFiles";

type Translate = (key: string, options?: Record<string, unknown>) => string;

function namesOf(paths: readonly string[]): string[] {
  return paths.map((path) => basename(path.trim())).filter(Boolean);
}

/** Non-WAV names from a dialog or a drop. WAV files stay out of the message. */
export function formatWavRejectedNotice(
  t: Translate,
  paths: readonly string[],
): string | null {
  const rejected = namesOf(paths).filter((name) => !isWavFileName(name));
  return formatWavOnlyImportError(t, rejected);
}

/**
 * Files that are not manual annotation `.txt`.
 * Prediction exports get their own sentence. Other types name the file.
 */
export function formatAnnotationRejectedNotice(
  t: Translate,
  paths: readonly string[],
): string | null {
  const rejected = paths.map((path) => path.trim()).filter((path) => path && !isAnnotationPath(path));
  if (!rejected.length) return null;
  const predict = rejected.filter((path) => isPredictExportPath(path));
  const other = rejected.filter((path) => !isPredictExportPath(path));
  const parts: string[] = [];
  if (other.length === 1) {
    parts.push(t("audioImport.txtOnlyOne", { name: basename(other[0]) }));
  } else if (other.length > 1) {
    parts.push(
      t("audioImport.txtOnlyMany", { names: namesOf(other).join(", ") }),
    );
  }
  if (predict.length) {
    parts.push(t("projects.studio.annotations.renamePredictFirst"));
  }
  return parts.join("\n");
}
