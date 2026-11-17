import { getSidecarBase } from "../sidecar";
import type {
  ProjectPipeline,
  SnippetCalculatorRequest,
  SnippetCalculatorResult,
} from "./types";
import { parseError } from "./parseError";

export async function fetchProjectPipeline(
  id: string,
  opts?: { fresh?: boolean },
): Promise<ProjectPipeline> {
  const fresh = opts?.fresh ? "?fresh=true" : "";
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/pipeline${fresh}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as ProjectPipeline;
}

export async function calculateProjectSnippets(
  id: string,
  body: SnippetCalculatorRequest,
  signal?: AbortSignal,
): Promise<SnippetCalculatorResult> {
  const res = await fetch(`${getSidecarBase()}/v1/projects/${id}/snippet-calculator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as SnippetCalculatorResult;
}
