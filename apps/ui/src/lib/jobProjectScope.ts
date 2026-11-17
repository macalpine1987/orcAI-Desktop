/** True when a job was started for this project folder. */
export function jobMatchesProjectDir(
  params: Record<string, unknown> | null | undefined,
  projectDir: string | null | undefined,
): boolean {
  if (!projectDir?.trim()) return false;
  const raw = params?.project_dir;
  if (typeof raw !== "string" || !raw.trim()) return false;
  return canonicalProjectDir(raw) === canonicalProjectDir(projectDir);
}

function canonicalProjectDir(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}
