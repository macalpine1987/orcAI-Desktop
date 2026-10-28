import { getSidecarBase } from "./sidecar";

export type OrcaiModel = {
  id: string;
  name: string;
  path: string;
  kind?: "builtin" | "trained";
  description?: string;
  /** Class names from the model's ``orcai_parameter.json`` ``calls`` list. */
  calls?: string[];
  class_count?: number;
  val_mba?: number | null;
  size_bytes?: number | null;
  trained_at?: string | null;
  display_path?: string;
  has_test?: boolean;
};

export type ModelCatalogFile = {
  name: string;
  role: string;
};

export type ModelTestClassRow = {
  label: string;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  total: number;
};

export type ModelTestBundle = {
  dataset: string;
  metrics_path: string;
  confusion_path: string | null;
  mba: number | null;
  loss: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  classes: ModelTestClassRow[];
};

export type ModelCompatibilityIssue = {
  code: string;
  field: string;
  detail: string;
};

export type ModelCompatibility = {
  ok: boolean;
  checked: boolean;
  reason?: string | null;
  issues: ModelCompatibilityIssue[];
  project_parameter?: string | null;
  model_calls?: string[];
  project_calls?: string[];
};

export type ModelDetail = OrcaiModel & {
  files: ModelCatalogFile[];
  spectrogram: Record<string, unknown>;
  /** Snippet / TVT split block from the model's orcai_parameter.json (INV-2). */
  snippets?: Record<string, unknown>;
  model: Record<string, unknown>;
  architecture?: string | null;
  shape: Record<string, unknown> | null;
  test: ModelTestBundle | null;
  compatibility: ModelCompatibility;
};

async function throwHttpError(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => "");
  let message = text.trim();
  try {
    const json = JSON.parse(text) as { detail?: unknown };
    const detail = json.detail;
    if (typeof detail === "string" && detail.trim()) {
      message = detail.trim();
    } else if (detail && typeof detail === "object") {
      const msg = (detail as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) message = msg.trim();
    }
  } catch {
    /* keep raw body */
  }
  throw new Error(message || fallback);
}

export async function fetchModels(projectDir?: string): Promise<OrcaiModel[]> {
  const url = new URL(`${getSidecarBase()}/v1/models`);
  if (projectDir) url.searchParams.set("project_dir", projectDir);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) await throwHttpError(res, `Models request failed: ${res.status}`);
  const data = (await res.json()) as { models: OrcaiModel[] };
  return data.models;
}

export async function fetchModelDetail(
  modelId: string,
  projectDir?: string,
): Promise<ModelDetail> {
  const url = new URL(`${getSidecarBase()}/v1/models/detail`);
  url.searchParams.set("model_id", modelId);
  if (projectDir) url.searchParams.set("project_dir", projectDir);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) await throwHttpError(res, `Model detail failed: ${res.status}`);
  return (await res.json()) as ModelDetail;
}

export async function checkModelCompatibility(
  modelId: string,
  projectDir: string,
): Promise<ModelCompatibility> {
  const res = await fetch(`${getSidecarBase()}/v1/models/compatibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId, project_dir: projectDir }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) await throwHttpError(res, `Compatibility check failed: ${res.status}`);
  return (await res.json()) as ModelCompatibility;
}

export async function importModelDirectory(params: {
  sourceDir: string;
  projectDir: string;
  destName?: string;
}): Promise<{ model: OrcaiModel }> {
  const res = await fetch(`${getSidecarBase()}/v1/models/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_dir: params.sourceDir,
      project_dir: params.projectDir,
      dest_name: params.destName ?? null,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) await throwHttpError(res, `Import failed: ${res.status}`);
  return (await res.json()) as { model: OrcaiModel };
}

export async function exportModelDirectory(params: {
  modelId: string;
  destParent: string;
  projectDir?: string;
  destName?: string;
}): Promise<{ path: string; name: string }> {
  const res = await fetch(`${getSidecarBase()}/v1/models/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: params.modelId,
      dest_parent: params.destParent,
      project_dir: params.projectDir ?? null,
      dest_name: params.destName ?? null,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) await throwHttpError(res, `Export failed: ${res.status}`);
  return (await res.json()) as { path: string; name: string };
}
