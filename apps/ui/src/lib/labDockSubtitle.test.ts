import { describe, expect, it, vi, afterEach } from "vitest";
import type { JobRecord } from "../api/jobs";
import { dockTabSubtitle } from "./labDockSubtitle";

const t = ((key: string, opts?: { command?: string; pct?: number }) => {
  if (key === "lab.tabSubtitle.runningWithPct") {
    return `${opts?.command} · running · ${opts?.pct}%`;
  }
  if (key === "lab.tabSubtitle.running") return `${opts?.command} running`;
  if (key === "lab.tabSubtitle.failed") return `${opts?.command} · failed`;
  if (key === "pipeline.steps.predict") return "Predict";
  if (key === "jobs.status.completed") return "Done";
  if (key === "jobs.status.pending") return "Queued";
  return key;
}) as import("i18next").TFunction;

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "j1",
    command: "predict",
    params: {},
    status: "running",
    created_at: 0,
    updated_at: 0,
    log: [],
    result: null,
    error: null,
    ...overrides,
  };
}

describe("dockTabSubtitle · m26/m27", () => {
  it("returns null without selected job", () => {
    expect(dockTabSubtitle("command", t, null)).toBeNull();
  });

  it("log tab · running shows running subtitle with progress", () => {
    expect(
      dockTabSubtitle("log", t, job({ status: "running", progress: 0.62 })),
    ).toBe("Predict · running · 62%");
  });

  it("command tab · running shows running subtitle", () => {
    expect(dockTabSubtitle("command", t, job({ status: "running" }))).toBe(
      "Predict running",
    );
  });

  it("command tab · failed shows failed subtitle", () => {
    expect(dockTabSubtitle("command", t, job({ status: "failed" }))).toBe(
      "Predict · failed",
    );
  });

  it("command tab · completed shows command and status", () => {
    expect(dockTabSubtitle("command", t, job({ status: "completed" }))).toBe(
      "Predict · Done",
    );
  });

  it("errors tab · only for failed job", () => {
    expect(dockTabSubtitle("errors", t, job({ status: "failed" }))).toBe(
      "Predict · failed",
    );
    expect(dockTabSubtitle("errors", t, job({ status: "running" }))).toBeNull();
  });

  it("log/inspector tabs", () => {
    expect(dockTabSubtitle("inspector", t, job())).toBeNull();
  });
});
