import { getSidecarBase } from "./sidecar";

export type SpectrogramCacheClearResult = {
  root: string;
  files_removed: number;
  bytes_removed: number;
};

export type FactoryResetResult = {
  database: {
    deleted: number;
    cancelled_active: number;
    projects_cleared: number;
    project_dbs_removed: number;
  };
  cache: SpectrogramCacheClearResult;
};

export async function clearSpectrogramCache(): Promise<SpectrogramCacheClearResult> {
  const res = await fetch(`${getSidecarBase()}/v1/spectrograms/cache/clear`, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Clear spectrogram cache failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as SpectrogramCacheClearResult;
}

export async function factoryResetDesktop(): Promise<FactoryResetResult> {
  const res = await fetch(`${getSidecarBase()}/v1/maintenance/factory-reset`, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Factory reset failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as FactoryResetResult;
}
