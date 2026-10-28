import { describe, expect, it } from "vitest";
import { predictJobModelParams } from "./predictModel";
import type { OrcaiModel } from "./models";

const trainedPath = "/data/project/models/my_run";

const models: OrcaiModel[] = [
  {
    id: "orcai-isl-v1",
    name: "orcai-isl-v1",
    path: "/venv/orcai/models/orcai-isl-v1",
    kind: "builtin",
  },
  {
    id: trainedPath,
    name: "my_run",
    path: trainedPath,
    kind: "trained",
  },
];

describe("predictJobModelParams", () => {
  it("uses model name for builtin models", () => {
    expect(predictJobModelParams("orcai-isl-v1", models)).toEqual({
      model: "orcai-isl-v1",
    });
  });

  it("passes model_dir for trained models", () => {
    expect(predictJobModelParams(trainedPath, models)).toEqual({
      model: "my_run",
      model_dir: trainedPath,
    });
  });

  it("falls back to nav modelDir before models list loads", () => {
    expect(
      predictJobModelParams(trainedPath, [], {
        modelDir: trainedPath,
      }),
    ).toEqual({
      model: "my_run",
      model_dir: trainedPath,
    });
  });

  it("does not attach stale modelDir to builtin models", () => {
    expect(
      predictJobModelParams("orcai-isl-v1", models, {
        modelDir: trainedPath,
      }),
    ).toEqual({
      model: "orcai-isl-v1",
    });
  });
});
