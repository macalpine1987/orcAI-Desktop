/** WAV paths accepted for project recordings import (dialog or drag-and-drop). */

const WAV_EXT = /\.wav$/i;

export function isWavPath(path: string): boolean {
  return WAV_EXT.test(path.trim());
}

export function filterWavPaths(paths: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const path = raw.trim();
    if (!path || !isWavPath(path)) continue;
    const key = path.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  // Drag-drop / multi-select order is arbitrary — show and import A→Z by filename.
  out.sort((a, b) => {
    const an = a.replace(/\\/g, "/").split("/").pop() ?? a;
    const bn = b.replace(/\\/g, "/").split("/").pop() ?? b;
    return an.localeCompare(bn, undefined, { sensitivity: "base" });
  });
  return out;
}

/** Absolute paths from a browser/Tauri FileList drop (`File.path` in webviews). */
export function pathsFromFileList(files: FileList | File[] | null | undefined): string[] {
  if (!files || files.length === 0) return [];
  const list = Array.from(files);
  const paths: string[] = [];
  for (const file of list) {
    const withPath = file as File & { path?: string };
    if (typeof withPath.path === "string" && withPath.path.trim()) {
      paths.push(withPath.path);
    }
  }
  return filterWavPaths(paths);
}

export function pointInClientRect(
  clientX: number,
  clientY: number,
  rect: DOMRect | null | undefined,
): boolean {
  if (!rect) return false;
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}
