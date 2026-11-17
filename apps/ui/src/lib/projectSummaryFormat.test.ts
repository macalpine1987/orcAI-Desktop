import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../api/projects";
import {
  formatNextActionsHint,
  readinessFocusLabel,
  readinessLineDetail,
} from "./projectSummaryFormat";

const baseSummary = (): ProjectSummary => ({
  project_id: "p1",
  display_name: "Demo",
  project_kind: "recognition",
  focus: "full",
  metrics: {
    recordings: 12,
    annotations: 9,
    predicted: 7,
    trained_models: 1,
    recordings_total: 12,
    annotations_total: 12,
  },
  primary_model_name: "isl-v1",
  recording_table: { path: "/tmp/t.csv", sync_status: "current" },
  readiness: {
    recordings: "ready",
    annotations: "ready",
    predict: "ready",
    datasets: "ready",
    model: "ready",
  },
  readiness_lines: {
    recordings: { state: "ready", wav_count: 12, table_rows: 12 },
    annotations: { state: "ready", annotated: 9, total: 12 },
    predict: { state: "ready", predicted: 7, total: 12 },
    datasets: { state: "ready", file_count: 4, has_tvt_dir: true },
    model: { state: "ready", checkpoint_count: 1, model_name: "isl-v1" },
  },
  next_actions: ["predict", "filter", "results"],
});

describe("projectSummaryFormat", () => {
  const t = ((key: string, opts?: Record<string, unknown>) => {
    if (opts?.count != null) return `${key}:${opts.count}`;
    if (opts?.annotated != null) return `${opts.annotated}/${opts.total}`;
    if (opts?.predicted != null) return `${opts.predicted}/${opts.total}`;
    if (opts?.steps != null) return `steps:${opts.steps}`;
    return key;
  }) as never;

  it("formats readiness line details from summary", () => {
    const summary = baseSummary();
    expect(readinessLineDetail(summary, "recordings", t)).toBe(
      "home.readinessDetail.recordingsWav:12",
    );
    expect(readinessLineDetail(summary, "annotations", t)).toBe("9/12");
    expect(readinessLineDetail(summary, "predict", t)).toBe("7/12");
    expect(readinessLineDetail(summary, "model", t)).toBe("isl-v1");
  });

  it("counts WAV files, paired annotations, and predictions against those files", () => {
    const summary = baseSummary();
    summary.metrics.recordings = 20;
    summary.metrics.annotations = 9;
    summary.readiness_lines.recordings = {
      state: "needed",
      wav_count: 12,
      table_rows: 20,
    };
    summary.readiness_lines.annotations = {
      state: "ready",
      annotated: 9,
      total: 20,
      paired_files: 5,
    };
    summary.readiness_lines.predict = { state: "ready", predicted: 7, total: 20 };
    expect(readinessLineDetail(summary, "recordings", t)).toBe(
      "home.readinessDetail.recordingsWav:12",
    );
    expect(readinessLineDetail(summary, "annotations", t)).toBe("5/12");
    expect(readinessLineDetail(summary, "predict", t)).toBe("7/12");
  });

  it("shows zero paired annotations instead of the table count", () => {
    const summary = baseSummary();
    summary.readiness_lines.annotations = {
      state: "ready",
      annotated: 9,
      total: 12,
      paired_files: 0,
    };
    expect(readinessLineDetail(summary, "annotations", t)).toBe("0/12");
  });

  it("keeps the table annotation count when paired_files is absent", () => {
    const summary = baseSummary();
    summary.readiness_lines.recordings.wav_count = 0;
    summary.readiness_lines.recordings.table_rows = 20;
    summary.readiness_lines.predict.total = 20;
    expect(readinessLineDetail(summary, "recordings", t)).toBe(
      "home.readinessDetail.recordingsWav:0",
    );
    expect(readinessLineDetail(summary, "annotations", t)).toBe("9/12");
    expect(readinessLineDetail(summary, "predict", t)).toBe("7/20");
  });

  it("home hint keeps remaining predict next to filter and missing labels", () => {
    expect(
      formatNextActionsHint(
        ["predict", "filter", "annotate", "results"],
        t,
      ),
    ).toBe(
      "steps:home.nextAction.predict · home.nextAction.filter · home.nextAction.annotate · home.nextAction.results",
    );
  });

  it("formats focus and next-step hints", () => {
    expect(readinessFocusLabel("full", t)).toBe("home.readinessFocus.full");
    expect(formatNextActionsHint(["predict", "train"], t)).toBe(
      "steps:home.nextAction.predict · home.nextAction.train",
    );
  });
});
