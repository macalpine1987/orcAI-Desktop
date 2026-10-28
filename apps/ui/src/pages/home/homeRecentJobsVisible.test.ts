import { describe, expect, it } from "vitest";
import {
  HOME_RECENT_JOBS_MAX,
  homeRecentJobsVisibleCount,
} from "./homeRecentJobsVisible";

describe("homeRecentJobsVisibleCount", () => {
  it("returns 0 when there are no jobs", () => {
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 400,
        dockCollapsed: true,
        jobCount: 0,
      }),
    ).toBe(0);
  });

  it("fits available height without exceeding fit (both dock states)", () => {
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 28 + 34 * 14,
        dockCollapsed: true,
        jobCount: 20,
      }),
    ).toBe(14);
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 28 + 34 * 10,
        dockCollapsed: true,
        jobCount: 20,
      }),
    ).toBe(10);
    // Tiny panel: at most 1 row (not forced MIN=4).
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 40,
        dockCollapsed: true,
        jobCount: 20,
      }),
    ).toBe(1);
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 28 + 34 * 2,
        dockCollapsed: true,
        jobCount: 20,
      }),
    ).toBe(2);
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 28 + 34 * 5,
        dockCollapsed: true,
        jobCount: 20,
      }),
    ).toBe(5);
  });

  it("QA-L1: expanded dock also fits panel height (no dual-mode MAX bypass)", () => {
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 80,
        dockCollapsed: false,
        jobCount: 40,
      }),
    ).toBe(1);
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 28 + 34 * 7,
        dockCollapsed: false,
        jobCount: 40,
      }),
    ).toBe(7);
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 28 + 34 * 20,
        dockCollapsed: false,
        jobCount: 7,
      }),
    ).toBe(7);
    expect(
      homeRecentJobsVisibleCount({
        panelHeightPx: 28 + 34 * 20,
        dockCollapsed: false,
        jobCount: 40,
      }),
    ).toBe(HOME_RECENT_JOBS_MAX);
  });
});
