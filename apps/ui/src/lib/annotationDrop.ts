/** Annotation ``.txt`` paths for project import (dialog or drag-and-drop). */

const TXT_EXT = /\.txt$/i;
/** Predict / filter exports are not annotations — rename to ``{wavStem}.txt`` first. */
const SKIP_SUFFIXES = [/_predicted\.txt$/i, /_filtered\.txt$/i];

export function isAnnotationPath(path: string): boolean {
  const trimmed = path.trim();
  if (!TXT_EXT.test(trimmed)) return false;
  return !SKIP_SUFFIXES.some((re) => re.test(trimmed));
}

/** True when the path looks like an orcAI predict/filter label export. */
export function isPredictExportPath(path: string): boolean {
  const trimmed = path.trim();
  if (!TXT_EXT.test(trimmed)) return false;
  return SKIP_SUFFIXES.some((re) => re.test(trimmed));
}

export function filterAnnotationPaths(paths: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const path = raw.trim();
    if (!path || !isAnnotationPath(path)) continue;
    const key = path.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  out.sort((a, b) => {
    const an = a.replace(/\\/g, "/").split("/").pop() ?? a;
    const bn = b.replace(/\\/g, "/").split("/").pop() ?? b;
    return an.localeCompare(bn, undefined, { sensitivity: "base" });
  });
  return out;
}

/** Absolute paths from a browser/Tauri FileList drop (`File.path` in webviews). */
export function annotationPathsFromFileList(
  files: FileList | File[] | null | undefined,
): string[] {
  if (!files || files.length === 0) return [];
  const paths: string[] = [];
  for (const file of Array.from(files)) {
    const withPath = file as File & { path?: string };
    if (typeof withPath.path === "string" && withPath.path.trim()) {
      paths.push(withPath.path);
    }
  }
  return filterAnnotationPaths(paths);
}
