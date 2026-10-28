import { describe, expect, it } from "vitest";
import type { ProjectPipeline } from "../api/projects";
import { pipelineBlockedWithoutAnnotations } from "./trainPipeline";

function board(wavCount: number, paired: number): ProjectPipeline {
  return {
    readiness: {
      annotations: {
        state: paired > 0 ? "ok" : "warn",
        annotated: paired,
        total: wavCount,
        paired,
        wav_count: wavCount,
      },
    },
  } as ProjectPipeline;
}

describe("pipelineBlockedWithoutAnnotations", () => {
  it("blocks the label chain only when loaded WAVs have no paired txt", () => {
    expect(pipelineBlockedWithoutAnnotations(board(4, 0))).toBe(true);
    expect(pipelineBlockedWithoutAnnotations(board(4, 1))).toBe(false);
    expect(pipelineBlockedWithoutAnnotations(board(0, 0))).toBe(false);
    expect(pipelineBlockedWithoutAnnotations(null)).toBe(false);
  });
});
