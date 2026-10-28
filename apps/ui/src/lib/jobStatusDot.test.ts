import { describe, expect, it } from "vitest";
import {
  JOB_STATUS_DOT_CLASS,
  JOB_STATUS_PILL_CLASS,
} from "./jobStatusDot";

describe("jobStatusDot class maps", () => {
  it("exposes all job status dot modifiers for Tailwind purge", () => {
    for (const key of [
      "running",
      "pending",
      "completed",
      "failed",
      "cancelled",
    ] as const) {
      expect(JOB_STATUS_DOT_CLASS[key]).toMatch(/^jobs-status-dot--/);
      expect(JOB_STATUS_PILL_CLASS[key]).toMatch(/^job-status-pill--/);
    }
  });
});
