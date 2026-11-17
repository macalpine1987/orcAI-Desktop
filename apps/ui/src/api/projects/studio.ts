import { getSidecarBase } from "../sidecar";
import { notifyProjectParametersSaved } from "../../lib/projectParametersEvents";
import type {
  ImportAnnotationsResult,
  ParameterValidation,
  ProjectAnnotations,
  ProjectArtifacts,
  ProjectParameters,
  ProjectRecordingTable,
  ProjectUnpairedAnnotation,
} from "./types";
import { parseError } from "./parseError";

export async function fetchProjectRecordingTable(
  id: string,
): Promise<ProjectRecordingTable> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/recording-table`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectRecordingTable;
}

export async function setProjectRecordingChannel(
  id: string,
  recording: string,
  channel: number,
): Promise<{ recording: string; channel: number; table_path: string }> {
  const res = await fetch(
    `${getSidecarBase()}/v1/projects/${id}/recording-table/rows/${encodeURIComponent(recording)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as { recording: string; channel: number; table_path: string };
}

export async function fetchProjectAnnotations(id: string): Promise<ProjectAnnotations> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/annotations`, {
    // Large annotation trees can exceed 30s while the sidecar scans .txt files.
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectAnnotations;
}

export async function importProjectAnnotations(
  id: string,
  paths: string[],
): Promise<ImportAnnotationsResult> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/annotations/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ImportAnnotationsResult;
}

export async function deleteProjectAnnotations(
  id: string,
  filenames: string[],
): Promise<{ removed: string[]; missing: string[]; unpaired: ProjectUnpairedAnnotation[] }> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/annotations/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filenames }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as {
    removed: string[];
    missing: string[];
    unpaired: ProjectUnpairedAnnotation[];
  };
}

export async function fetchProjectArtifacts(id: string): Promise<ProjectArtifacts> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/artifacts`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectArtifacts;
}

export async function fetchProjectParameters(id: string): Promise<ProjectParameters> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/parameters`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectParameters;
}

export async function validateProjectParameters(
  id: string,
  text: string,
): Promise<ParameterValidation> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/parameters/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ParameterValidation;
}

export async function saveProjectParameters(
  id: string,
  text: string,
): Promise<ProjectParameters> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/parameters`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) await parseError(res);
  const saved = (await res.json()) as ProjectParameters;
  // Pipeline readiness / snippets banner must re-read disk immediately.
  notifyProjectParametersSaved(id);
  return saved;
}
