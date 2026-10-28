import { getSidecarBase } from "./sidecar";

export async function pathExists(path: string): Promise<boolean> {
  const url = new URL(`${getSidecarBase()}/v1/fs/exists`);
  url.searchParams.set("path", path);
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return false;
  const data = (await res.json()) as { exists?: boolean };
  return Boolean(data.exists);
}

/**
 * Resolve project ``*_orcai_parameter.json`` the same way as sidecar
 * (folder basename, then any ``*_orcai_parameter.json``). Never uses display_name.
 */
export async function resolveOrcaiParameterPath(
  projectDir: string,
): Promise<string | null> {
  const url = new URL(`${getSidecarBase()}/v1/fs/orcai-parameter`);
  url.searchParams.set("project_dir", projectDir);
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { path?: string | null; exists?: boolean };
  const path = typeof data.path === "string" ? data.path.trim() : "";
  return path || null;
}
