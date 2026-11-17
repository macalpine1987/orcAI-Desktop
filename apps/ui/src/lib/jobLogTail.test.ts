import { describe, expect, it } from "vitest";
import {
  JOB_LIST_POLL_LOG_MAX_LINES,
  JOB_LOG_UI_MAX_LINES,
  jobLogNextSince,
  stripJobLogForListPoll,
  trimJobLogLines,
} from "./jobLogTail";

describe("jobLogTail", () => {
  it("trimJobLogLines keeps the newest lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `L${i}`);
    expect(trimJobLogLines(lines, 4)).toEqual(["L6", "L7", "L8", "L9"]);
    expect(trimJobLogLines(lines, 20)).toEqual(lines);
  });

  it("jobLogNextSince uses log_base", () => {
    expect(jobLogNextSince({ log: ["a", "b"], log_base: 10 })).toBe(12);
    expect(jobLogNextSince({ log: ["a"], log_base: null })).toBe(1);
  });

  it("UI max matches the Stage 8 bound", () => {
    expect(JOB_LOG_UI_MAX_LINES).toBe(8000);
  });

  it("stripJobLogForListPoll keeps a short newest tail and bumps log_base", () => {
    expect(JOB_LIST_POLL_LOG_MAX_LINES).toBe(200);
    const log = Array.from({ length: 250 }, (_, i) => `L${i}`);
    const stripped = stripJobLogForListPoll({ log, log_base: 10 }, 200);
    expect(stripped.log).toHaveLength(200);
    expect(stripped.log[0]).toBe("L50");
    expect(stripped.log_base).toBe(60);
    expect(stripJobLogForListPoll({ log: [], log_base: 3 })).toEqual({
      log: [],
      log_base: 3,
    });
  });
});
