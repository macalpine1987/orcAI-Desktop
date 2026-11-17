import { describe, expect, it } from "vitest";
import type { ProjectPipeline } from "../api/projects";
import {
  homeWizardPlanFocusStepId,
  homeWizardPlanFromBoard,
  homeWizardPlanIsBusy,
} from "./homeWizardPlan";

function step(
  id: string,
  status: "done" | "running" | "queued" | "idle",
  progress: number | null = null,
) {
  return {
    id,
    order: 0,
    optional: id === "hpsearch",
    status,
    reason: null,
    command: id,
    artifact_path: "",
    artifact_label: id,
    artifact_kind: "files" as const,
    file_count: 0,
    size_bytes: 0,
    updated_at: null,
    job_id: null,
    job_status: null,
    progress,
    error: null,
    can_run: false,
    run_params: {},
  };
}

describe("homeWizardPlanFromBoard", () => {
  it("returns null without active_plan", () => {
    const board = {
      active_plan: null,
      steps: [step("train", "running")],
    } as unknown as ProjectPipeline;
    expect(homeWizardPlanFromBoard(board)).toBeNull();
    expect(homeWizardPlanFromBoard(null)).toBeNull();
  });

  it("maps plan commands to step statuses and skips hpsearch when omitted", () => {
    const board = {
      active_plan: {
        plan_id: "p1",
        queued: 1,
        running: 1,
        job_id: "j1",
        commands: [
          "create-tvt-data",
          "train",
          "test",
        ],
        includes_hpsearch: false,
      },
      steps: [
        step("create-tvt-data", "done"),
        step("hpsearch", "idle"),
        step("train", "running", 0.4),
        step("test", "queued"),
      ],
    } as unknown as ProjectPipeline;

    const view = homeWizardPlanFromBoard(board);
    expect(view?.planId).toBe("p1");
    expect(view?.includesHpsearch).toBe(false);
    expect(view?.steps.map((s) => s.id)).toEqual([
      "create-tvt-data",
      "train",
      "test",
    ]);
    expect(view?.steps[1]?.status).toBe("running");
    expect(view?.done).toBe(1);
    expect(view?.total).toBe(3);
  });

  it("reorders commands into pipeline board order (jobs may be newest-first)", () => {
    const board = {
      active_plan: {
        plan_id: "p2",
        queued: 2,
        running: 1,
        job_id: "j-train",
        // Sidecar used to append in updated_at DESC discovery order.
        commands: [
          "test",
          "train",
          "create-tvt-data",
          "create-tvt-snippet-tables",
          "create-snippet-table",
          "create-label-arrays",
          "create-spectrograms",
        ],
        includes_hpsearch: false,
      },
      steps: [
        step("create-spectrograms", "done"),
        step("create-label-arrays", "done"),
        step("create-snippet-table", "done"),
        step("create-tvt-snippet-tables", "done"),
        step("create-tvt-data", "done"),
        step("train", "running"),
        step("test", "queued"),
      ],
    } as unknown as ProjectPipeline;

    const view = homeWizardPlanFromBoard(board);
    expect(view?.steps.map((s) => s.id)).toEqual([
      "create-spectrograms",
      "create-label-arrays",
      "create-snippet-table",
      "create-tvt-snippet-tables",
      "create-tvt-data",
      "train",
      "test",
    ]);
  });
});

describe("homeWizardPlanIsBusy", () => {
  it("is busy while queued or running", () => {
    expect(
      homeWizardPlanIsBusy({
        plan_id: "p",
        queued: 1,
        running: 0,
        job_id: null,
      }),
    ).toBe(true);
    expect(
      homeWizardPlanIsBusy({
        plan_id: "p",
        queued: 0,
        running: 0,
        job_id: null,
      }),
    ).toBe(false);
  });
});

describe("homeWizardPlanFocusStepId", () => {
  it("prefers running over error and earlier done steps", () => {
    expect(
      homeWizardPlanFocusStepId([
        { id: "create-spectrograms", status: "done" },
        { id: "train", status: "running" },
        { id: "test", status: "queued" },
      ]),
    ).toBe("train");
    expect(
      homeWizardPlanFocusStepId([
        { id: "create-tvt-data", status: "error" },
        { id: "train", status: "queued" },
      ]),
    ).toBe("create-tvt-data");
    expect(
      homeWizardPlanFocusStepId([
        { id: "train", status: "done" },
        { id: "test", status: "done" },
      ]),
    ).toBeNull();
  });
});
