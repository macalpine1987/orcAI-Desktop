import { getSidecarBase } from "../sidecar";
import {
  normalizeProjectRecord,
  type CreateProjectParams,
  type ProjectFocus,
  type ProjectNameCheckResult,
  type ProjectRecord,
  type ProjectSummary,
} from "./types";
import { parseError } from "./parseError";

export async function checkProjectNameAvailable(
  parent_dir: string,
  display_name: string,
  exclude_id?: string,
  opts?: { displayNameOnly?: boolean },
): Promise<ProjectNameCheckResult> {
  const url = new URL(`${getSidecarBase()}/v1/projects/check-name`);
  url.searchParams.set("parent_dir", parent_dir);
  url.searchParams.set("display_name", display_name);
  if (exclude_id) {
    url.searchParams.set("exclude_id", exclude_id);
  }
  if (opts?.displayNameOnly) {
    url.searchParams.set("display_name_only", "true");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectNameCheckResult;
}

export async function fetchProjects(): Promise<ProjectRecord[]> {
  const res = await fetch(`${getSidecarBase()}/v1/projects`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { projects: ProjectRecord[] };
  return data.projects.map(normalizeProjectRecord);
}

export async function fetchProject(id: string): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export async function fetchProjectSummary(
  id: string,
  opts?: { fresh?: boolean },
): Promise<ProjectSummary> {
  const fresh = opts?.fresh ? "?fresh=true" : "";
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/summary${fresh}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ProjectSummary;
}

export async function createProject(
  params: CreateProjectParams,
): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "",
      import_paths: [],
      ...params,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export async function registerProject(
  path: string,
  display_name?: string,
): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, display_name }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export async function updateProject(
  id: string,
  patch: {
    display_name?: string;
    description?: string;
    focus?: ProjectFocus;
    auto_sync_recording_table?: boolean;
    predict_model?: string;
    predict_model_dir?: string | null;
    spectrogram_colormap?: string;
  },
): Promise<ProjectRecord> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return normalizeProjectRecord((await res.json()) as ProjectRecord);
}

export async function deleteProject(
  id: string,
  delete_files = false,
): Promise<void> {
  const url = new URL(`${getSidecarBase()}/v1/projects/${id}`);
  url.searchParams.set("delete_files", String(delete_files));
  const res = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
