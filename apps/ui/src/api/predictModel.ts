import type { PredictJobParams } from "./jobs";
import type { OrcaiModel } from "./models";

function findModel(modelId: string, models: OrcaiModel[]): OrcaiModel | undefined {
  return models.find((m) => m.id === modelId || m.path === modelId);
}

/** Build sidecar predict params: trained models require `model_dir` (orcAI CLI parity). */
export function predictJobModelParams(
  modelId: string,
  models: OrcaiModel[],
  options?: { modelDir?: string },
): Pick<PredictJobParams, "model" | "model_dir"> {
  const entry = findModel(modelId, models);

  if (entry?.kind === "trained" && entry.path) {
    return { model: entry.name, model_dir: entry.path };
  }

  if (entry) {
    return { model: entry.id };
  }

  const modelDir = options?.modelDir?.trim();
  if (modelDir) {
    const byPath = models.find((m) => m.path === modelDir);
    if (byPath?.kind === "trained") {
      return { model: byPath.name, model_dir: byPath.path };
    }
    if (models.length === 0) {
      const name = modelDir.split(/[/\\]/).pop() ?? modelId;
      return { model: name, model_dir: modelDir };
    }
  }

  return { model: modelId };
}
