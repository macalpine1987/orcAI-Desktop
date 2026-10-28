import { describe, expect, it } from "vitest";
import {
  hintStepForPipelineReason,
  isPipelineReasonId,
  pipelineReasonCopy,
  type PipelineReasonId,
} from "./pipelineReasonExplain";

const REASONS: PipelineReasonId[] = [
  "missing_recording_table",
  "no_recordings",
  "no_annotations",
  "missing_spectrograms",
  "missing_label_arrays",
  "missing_snippet_table",
  "missing_tvt_tables",
  "missing_tvt_data",
  "missing_checkpoint",
  "job_failed",
  "params_changed",
  "params_changed_spectrogram",
  "params_changed_snippets",
  "upstream_changed",
];

describe("pipelineReasonExplain", () => {
  it("recognizes all board reason ids", () => {
    for (const id of REASONS) {
      expect(isPipelineReasonId(id)).toBe(true);
    }
    expect(isPipelineReasonId("nope")).toBe(false);
  });

  it("has RU/EN remediation for every reason", () => {
    for (const id of REASONS) {
      for (const lang of ["ru", "en"] as const) {
        const copy = pipelineReasonCopy(id, lang);
        expect(copy.title.length).toBeGreaterThan(3);
        expect(copy.steps.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("maps blocked reasons to the step whose Run should be highlighted", () => {
    expect(hintStepForPipelineReason("missing_spectrograms", "create-snippet-table")).toBe(
      "create-spectrograms",
    );
    expect(hintStepForPipelineReason("missing_label_arrays", "create-snippet-table")).toBe(
      "create-label-arrays",
    );
    expect(hintStepForPipelineReason("missing_checkpoint", "test")).toBe("train");
    expect(hintStepForPipelineReason("upstream_changed", "create-tvt-data")).toBe(
      "create-tvt-data",
    );
    expect(hintStepForPipelineReason("no_annotations", "create-label-arrays")).toBeNull();
  });
});
