/** Join absolute FS path segments for Tauri-reported project dirs (POSIX or Windows). */
export function joinFsPath(...parts: string[]): string {
  const cleaned = parts
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p, i) => {
      if (i === 0) return p.replace(/[/\\]+$/, "");
      return p.replace(/^[/\\]+/, "").replace(/[/\\]+$/, "");
    });
  if (cleaned.length === 0) return "";
  const useWin = /\\/.test(cleaned[0]!) || /^[A-Za-z]:/.test(cleaned[0]!);
  return cleaned.join(useWin ? "\\" : "/");
}
