import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { ProjectRecord, ProjectSummary, ProjectTableRow } from "../api/projects";
import {
  classesCountLabel,
  formatRowDuration,
  formatShortDateTime,
  formatTotalHours,
  isFullCycleReady,
  nextStepsFromSummary,
  projectsPageMode,
  projectsTabsForFocus,
  tabForNextAction,
  readinessAttentionKey,
  readinessCardDetail,
  readinessCardDetailKey,
  readinessCardInactiveForFocus,
  trainWizardBlockedByAnnotations,
  readinessCardTone,
  resampleNotes,
  totalDurationSec,
  initialWizardParent,
  isMissingProjectParentError,
  wizardParentWhenCatalogMissing,
  wizardProjectDir,
} from "./projectsStudio";

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${Object.values(opts).join(",")}` : key) as unknown as TFunction;

const summary = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  project_id: "p1",
  display_name: "Isafjordur-2026",
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
  primary_model_name: "orcai-isl-v1",
  recording_table: { path: "/p/recording_table.csv", sync_status: "current" },
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
    datasets: { state: "ready", file_count: 3, has_tvt_dir: true },
    model: { state: "ready", checkpoint_count: 1, model_name: "orcai-isl-v1" },
  },
  next_actions: ["predict", "train", "filter"],
  ...over,
});

const row = (over: Partial<ProjectTableRow> = {}): ProjectTableRow => ({
  recording: "01.wav",
  in_table: true,
  cells: {},
  wav_path: "/p/recordings/01.wav",
  wav_exists: true,
  size_bytes: 1,
  duration_sec: 60,
  sample_rate_hz: 48_000,
  channels: 1,
  resample_to_hz: null,
  annotation_path: null,
  annotation_exists: false,
  predict_status: "none",
  predicted_path: null,
  channel: 1,
  duplicate: false,
  ...over,
});

const project = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: "p1",
  path: "/p",
  display_name: "P",
  description: "",
  orcai_name: "P",
  project_kind: "recognition",
  focus: "recognition",
  created_at: 0,
  updated_at: 0,
  recording_table_path: null,
  recordings_dir: "/p/recordings",
  wav_count: 0,
  initialized: true,
  ...over,
});

describe("projectsStudio · page mode (m33/m34/m35)", () => {
  it("empty after init, then focus decides field/lab/full", () => {
    expect(projectsPageMode(null, null, 0)).toBe("none");
    expect(projectsPageMode(project(), null, 0)).toBe("empty");
    expect(projectsPageMode(project(), summary({ focus: "recognition" }), 4)).toBe("field");
    expect(projectsPageMode(project(), summary({ focus: "training" }), 4)).toBe("lab");
    expect(projectsPageMode(project(), summary({ focus: "full" }), 4)).toBe("full");
  });

  it("field focus hides annotations and artifacts tabs", () => {
    expect(projectsTabsForFocus("recognition")).toEqual(["recordings", "parameters"]);
    expect(projectsTabsForFocus("recognition")).toBe(projectsTabsForFocus("recognition"));
    expect(projectsTabsForFocus("training")).toEqual([
      "recordings",
      "annotations",
      "artifacts",
      "parameters",
    ]);
    expect(projectsTabsForFocus("full")).toEqual([
      "recordings",
      "annotations",
      "artifacts",
      "parameters",
    ]);
  });
});

describe("projectsStudio · m36 next steps", () => {
  it("full focus: predict, train, filter when annotations already ready", () => {
    const steps = nextStepsFromSummary(summary(), "full");
    expect(steps.map((s) => s.action)).toEqual(["predict", "train", "filter"]);
    expect(steps[0].count).toBe(5);
    expect(steps[0].command).toBe("predict · orcai-isl-v1");
    expect(steps[1].count).toBe(9);
    expect(steps[2].count).toBe(7);
  });

  it("full focus: annotate before create_tvt before predict (BUG-P-02/04)", () => {
    const steps = nextStepsFromSummary(
      summary({
        readiness: {
          recordings: "ready",
          annotations: "needed",
          predict: "needed",
          datasets: "empty",
          model: "empty",
        },
        readiness_lines: {
          ...summary().readiness_lines,
          annotations: { state: "needed", annotated: 0, total: 12 },
          predict: { state: "needed", predicted: 0, total: 12 },
          datasets: { state: "empty", file_count: 0, has_tvt_dir: false },
          model: { state: "empty", checkpoint_count: 0, model_name: null },
        },
      }),
      "full",
    );
    expect(steps.map((s) => s.action)).toEqual(["annotate", "predict"]);
    expect(steps[0].count).toBe(12);
  });

  it("prefers project predict_model in the command hint", () => {
    const steps = nextStepsFromSummary(
      summary({ predict_model: "orcai-nor-v1", primary_model_name: "trained-local" }),
      "recognition",
    );
    expect(steps[0].command).toBe("predict · orcai-nor-v1");
  });

  it("field focus: predict + filter only (no train/annotate)", () => {
    const steps = nextStepsFromSummary(summary(), "recognition");
    expect(steps.map((s) => s.action)).toEqual(["predict", "filter"]);
    const filter = steps.find((s) => s.action === "filter");
    expect(filter?.route).toBe("/predict");
    expect(filter?.routeState).toEqual({ tab: "filter" });
  });

  it("training focus: annotate when annotations needed (BUG-P-02)", () => {
    const steps = nextStepsFromSummary(
      summary({
        readiness: { ...summary().readiness, annotations: "needed", datasets: "empty" },
        readiness_lines: {
          ...summary().readiness_lines,
          annotations: { state: "needed", annotated: 0, total: 12 },
          datasets: { state: "empty", file_count: 0, has_tvt_dir: false },
        },
      }),
      "training",
    );
    expect(steps.map((s) => s.action)).toEqual(["annotate"]);
  });

  it("training focus: create_tvt when datasets not ready", () => {
    const steps = nextStepsFromSummary(
      summary({
        readiness: { ...summary().readiness, datasets: "needed" },
        readiness_lines: {
          ...summary().readiness_lines,
          datasets: { state: "needed", file_count: 0, has_tvt_dir: false },
        },
      }),
      "training",
    );
    expect(steps.map((s) => s.action)).toEqual(["create_tvt"]);
    expect(steps[0].route).toBe("/pipeline?view=wizard");
  });

  it("training focus: train when datasets ready", () => {
    const steps = nextStepsFromSummary(summary(), "training");
    expect(steps.map((s) => s.action)).toEqual(["train"]);
    expect(steps[0].command).toBe("train · -lmf");
    expect(steps[0].route).toBe("/pipeline?view=wizard");
  });

  it("stale table adds sync_table first for every focus", () => {
    const s = summary({ recording_table: { path: null, sync_status: "stale" } });
    expect(nextStepsFromSummary(s, "full")[0].action).toBe("sync_table");
    expect(nextStepsFromSummary(s, "recognition")[0].action).toBe("sync_table");
    expect(nextStepsFromSummary(s, "training")[0].action).toBe("sync_table");
  });

  it("tabForNextAction maps CTAs; create_tvt leaves Projects (BUG-P-03)", () => {
    expect(tabForNextAction("sync_table")).toBe("recordings");
    expect(tabForNextAction("predict")).toBe("recordings");
    expect(tabForNextAction("train")).toBe("annotations");
    expect(tabForNextAction("annotate")).toBe("annotations");
    expect(tabForNextAction("create_tvt")).toBeNull();
    expect(tabForNextAction("filter")).toBeNull();
  });

  it("full-cycle line when predict + model ready", () => {
    expect(isFullCycleReady(summary())).toBe(true);
    expect(
      isFullCycleReady(
        summary({ readiness: { ...summary().readiness, model: "empty" } }),
      ),
    ).toBe(false);
  });
});

describe("projectsStudio · readiness cards", () => {
  it("m33: fresh project highlights recordings", () => {
    const s = summary({
      readiness: {
        recordings: "needed",
        annotations: "empty",
        predict: "empty",
        datasets: "empty",
        model: "empty",
      },
      readiness_lines: {
        ...summary().readiness_lines,
        recordings: { state: "needed", wav_count: 0, table_rows: 0 },
      },
    });
    expect(readinessAttentionKey(s, "full")).toBe("recordings");
    expect(readinessCardDetail(s, "recordings", "full", t)).toBe(
      "projects.studio.readiness.addWav",
    );
    expect(readinessCardTone("needed", true)).toBe("attention");
    expect(readinessCardTone("ready", false)).toBe("ready");
  });

  it("m34: field focus marks annotations/datasets not required; inactive trio", () => {
    expect(readinessCardDetailKey("annotations", "empty", "recognition")).toBe(
      "projects.studio.readiness.notRequiredForFocus",
    );
    expect(readinessCardDetailKey("datasets", "empty", "recognition")).toBe(
      "projects.studio.readiness.notRequiredForFocus",
    );
    expect(readinessCardDetailKey("model", "empty", "recognition")).toBe(
      "projects.studio.readiness.notRequiredForFocus",
    );
    expect(readinessCardDetailKey("annotations", "ready", "recognition")).toBe(
      "projects.studio.readiness.notRequiredForFocus",
    );
    expect(readinessCardDetailKey("annotations", "empty", "full")).toBeNull();
    expect(readinessCardInactiveForFocus("annotations", "recognition")).toBe(true);
    expect(readinessCardInactiveForFocus("datasets", "recognition")).toBe(true);
    expect(readinessCardInactiveForFocus("model", "recognition")).toBe(true);
    expect(readinessCardInactiveForFocus("recordings", "recognition")).toBe(false);
    expect(readinessCardInactiveForFocus("predict", "recognition")).toBe(false);
    expect(readinessCardInactiveForFocus("model", "full")).toBe(false);
  });

  it("m35: lab focus dims predict as not required; datasets stay on path", () => {
    const s = summary({
      readiness: { ...summary().readiness, datasets: "needed", predict: "empty" },
    });
    expect(readinessAttentionKey(s, "training")).toBe("datasets");
    expect(readinessCardDetail(s, "predict", "training", t)).toBe(
      "projects.studio.readiness.notRequiredForFocus",
    );
    expect(readinessCardInactiveForFocus("predict", "training")).toBe(true);
    expect(readinessCardInactiveForFocus("datasets", "training")).toBe(false);
    expect(readinessCardInactiveForFocus("predict", "full")).toBe(false);
  });

  it("m36 detail strings", () => {
    const s = summary();
    expect(readinessCardDetail(s, "recordings", "full", t)).toBe(
      "projects.studio.readiness.tableCurrent:12",
    );
    expect(readinessCardDetail(s, "annotations", "full", t)).toBe(
      "projects.studio.readiness.annotations:9,12",
    );
    expect(readinessCardDetail(s, "predict", "full", t)).toBe(
      "projects.studio.readiness.predictedOf:7,12",
    );
    expect(readinessCardDetail(s, "datasets", "full", t)).toBe(
      "projects.studio.readiness.tvtReady",
    );
    expect(readinessCardDetail(s, "model", "full", t)).toBe(
      "projects.studio.readiness.model:isl-v1",
    );
  });
});

describe("projectsStudio · table formatting (m02)", () => {
  it("durations and totals", () => {
    expect(formatRowDuration(23 * 60 + 12)).toBe("23:12");
    expect(formatRowDuration(3723)).toBe("1:02:03");
    expect(formatRowDuration(null)).toBe("—");
    const rows = [row({ duration_sec: 3600 * 2 }), row({ duration_sec: 3600 * 2.6 })];
    expect(totalDurationSec(rows)).toBeCloseTo(3600 * 4.6);
    expect(formatTotalHours(totalDurationSec(rows), t)).toBe(
      "projects.studio.durationHours:4.6",
    );
    expect(formatTotalHours(120, t)).toBe("projects.studio.durationMinutes:2");
    expect(formatTotalHours(0, t)).toBeNull();
  });

  it("96 kHz rows produce one resample footer note", () => {
    const rows = [
      row(),
      row({ recording: "06.wav", sample_rate_hz: 96_000, resample_to_hz: 48_000 }),
      row({ recording: "07.wav", sample_rate_hz: 96_000, resample_to_hz: 48_000 }),
    ];
    expect(resampleNotes(rows)).toEqual([{ from: 96_000, to: 48_000 }]);
  });

  it("training wizard follows paired .txt files, not a CSV-only count", () => {
    expect(trainWizardBlockedByAnnotations(null)).toBe(true);
    expect(trainWizardBlockedByAnnotations(summary())).toBe(false);
    expect(
      trainWizardBlockedByAnnotations(
        summary({
          readiness_lines: {
            ...summary().readiness_lines,
            annotations: { state: "ready", annotated: 9, total: 12, paired_files: 0 },
          },
        }),
      ),
    ).toBe(true);
    expect(
      trainWizardBlockedByAnnotations(
        summary({
          readiness_lines: {
            ...summary().readiness_lines,
            annotations: { state: "needed", annotated: 0, total: 12, paired_files: 1 },
          },
        }),
      ),
    ).toBe(false);
    expect(
      trainWizardBlockedByAnnotations(
        summary({
          readiness_lines: {
            ...summary().readiness_lines,
            annotations: { state: "ready", annotated: 2, total: 12 },
          },
        }),
      ),
    ).toBe(false);
  });

  it("classes label follows parameters vs annotations", () => {
    expect(classesCountLabel(["BR", "BUZZ"], false, t)).toBe(
      "2 (projects.studio.classesFromParameters)",
    );
    expect(classesCountLabel(["BR"], true, t)).toBe("1 (projects.studio.classesFromAnnotations)");
    expect(classesCountLabel([], false, t)).toBe("—");
  });

  it("short timestamps and wizard folder preview", () => {
    expect(formatShortDateTime(null)).toBe("—");
    expect(formatShortDateTime(Date.UTC(2026, 7, 22, 12, 0) / 1000, "en-GB")).toMatch(
      /^22\.08 \d{2}:\d{2}$/,
    );
    expect(wizardProjectDir("/Users/x/orcai/", "Fjord-Field-2026")).toBe(
      "/Users/x/orcai/Fjord-Field-2026",
    );
    expect(wizardProjectDir("", "x")).toBe("");
  });

  it("picks the wizard parent: saved catalog, then open project, then home", () => {
    expect(
      initialWizardParent({
        projectsRoot: "/Users/ada/Documents",
        activeProjectPath: "/Users/ada/field/clip",
        fallbackRoot: "/Users/ada",
      }),
    ).toBe("/Users/ada/Documents");
    expect(
      initialWizardParent({
        projectsRoot: "  ",
        activeProjectPath: "/Users/ada/field/clip/",
        fallbackRoot: "/Users/ada/",
      }),
    ).toBe("/Users/ada/field");
    expect(
      initialWizardParent({
        projectsRoot: "",
        activeProjectPath: null,
        fallbackRoot: "/Users/ada/",
      }),
    ).toBe("/Users/ada");
  });

  it("falls back to home only when the saved catalog folder is gone", () => {
    expect(isMissingProjectParentError("Parent directory not found: /Users/ada/Documents")).toBe(
      true,
    );
    expect(isMissingProjectParentError("display_name is required")).toBe(false);
    expect(
      wizardParentWhenCatalogMissing({
        parent: "/Users/ada/Documents/",
        projectsRoot: "/Users/ada/Documents",
        fallbackRoot: "/Users/ada/",
      }),
    ).toBe("/Users/ada");
    expect(
      wizardParentWhenCatalogMissing({
        parent: "/Users/ada/picked",
        projectsRoot: "/Users/ada/Documents",
        fallbackRoot: "/Users/ada",
      }),
    ).toBeNull();
    expect(
      wizardParentWhenCatalogMissing({
        parent: "/Users/ada",
        projectsRoot: "/Users/ada",
        fallbackRoot: "/Users/ada",
      }),
    ).toBeNull();
  });
});
