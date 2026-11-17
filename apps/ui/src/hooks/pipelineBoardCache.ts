import type { ProjectPipeline } from "../api/projects";

const pipelineBoards = new Map<string, ProjectPipeline>();
const PIPELINE_BOARD_CACHE_MAX = 12;

export function getCachedPipelineBoard(
  id: string,
): ProjectPipeline | undefined {
  return pipelineBoards.get(id);
}

export function rememberPipelineBoard(
  id: string,
  data: ProjectPipeline,
): void {
  if (pipelineBoards.has(id)) pipelineBoards.delete(id);
  pipelineBoards.set(id, data);
  while (pipelineBoards.size > PIPELINE_BOARD_CACHE_MAX) {
    const oldest = pipelineBoards.keys().next().value;
    if (oldest == null || oldest === id) break;
    pipelineBoards.delete(oldest);
  }
}
