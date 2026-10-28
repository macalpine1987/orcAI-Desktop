import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");

describe("static gate · Jobs + console", () => {
  it("JobsPage has m16 columns and row actions", () => {
    const text = readFileSync(join(uiSrc, "pages/JobsPage.tsx"), "utf8");
    for (const key of [
      "colTarget",
      "colProgress",
      "colStarted",
      "colDuration",
      "jobs.action.cancel",
      "jobs.action.remove",
      "jobs.action.retry",
      "jobs.action.open",
      "retryJob",
      "cancelJob",
      "clearAllJobs",
      "predict-tabs-m03",
      "predict-tab",
      "predict-results-page-btn--filled",
      "jobs.errorsCount",
    ]) {
      expect(text, key).toContain(key);
    }
    expect(text).toContain('projectDir: null');
  });

  it("LabDock exposes four console tabs and m26/m27 layout", () => {
    const text = readFileSync(join(uiSrc, "components/LabDock.tsx"), "utf8");
    for (const tab of ["log", "inspector", "errors", "command"]) {
      expect(text).toContain(`"${tab}"`);
    }
    expect(text).toContain("lab.tab.${id}");
    expect(text).toContain("useJobLogTail");
    expect(text).toContain("useJobsListContext");
    expect(text).toContain("lab-errors-split");
    expect(text).toContain("lab.commandTitle");
  });

  it("labDockSubtitle module extracted for unit tests", () => {
    const text = readFileSync(join(uiSrc, "lib/labDockSubtitle.ts"), "utf8");
    expect(text).toContain("export function dockTabSubtitle");
    const test = readFileSync(
      join(uiSrc, "lib/labDockSubtitle.test.ts"),
      "utf8",
    );
    expect(test).toContain("dockTabSubtitle");
  });

  it("api/jobs.test.ts covers endpoints", () => {
    const text = readFileSync(join(uiSrc, "api/jobs.test.ts"), "utf8");
    for (const fn of [
      "fetchJobs",
      "fetchJobLogSince",
      "cancelJob",
      "retryJob",
      "fetchJobsQueue",
      "clearAllJobs",
    ]) {
      expect(text).toContain(fn);
    }
    const stream = readFileSync(join(uiSrc, "lib/jobEventStream.ts"), "utf8");
    expect(stream).toContain("jobEventsUrl");
    expect(stream).toContain("connectJobEventStream");
  });

  it("JobsListProvider wraps app shell (single polling + SSE progress)", () => {
    const main = readFileSync(join(uiSrc, "main.tsx"), "utf8");
    expect(main).toContain("JobsListProvider");
    const jobsCtx = readFileSync(join(uiSrc, "jobs/JobsListContext.tsx"), "utf8");
    expect(jobsCtx).toContain("useJobsProgressStream");
    // Transient offline during engine start must not wipe the list (table remount flicker).
    expect(jobsCtx).not.toMatch(/if\s*\(\s*!online\s*\)\s*\{[^}]*setJobs\(\[\]\)/s);
    expect(jobsCtx).toContain("initialLoad");
    const dock = readFileSync(join(uiSrc, "components/LabDock.tsx"), "utf8");
    expect(dock).not.toContain("useJobsList({");
  });

  it("LabJobContext tracks dock tab state", () => {
    const text = readFileSync(join(uiSrc, "lab/LabJobContext.tsx"), "utf8");
    expect(text).toContain("LabDockTab");
    expect(text).toContain("dockTab");
    expect(text).toContain("setDockTab");
  });

  it("RU/EN locales define jobs status and tab labels", () => {
    const ru = readFileSync(
      join(uiSrc, "../public/locales/ru/ru.json"),
      "utf8",
    );
    const en = readFileSync(
      join(uiSrc, "../public/locales/en/en.json"),
      "utf8",
    );
    for (const loc of [ru, en]) {
      expect(loc).toContain('"tab"');
      expect(loc).toContain('"errors"');
      expect(loc).toContain('"command"');
      expect(loc).toContain('"status"');
      expect(loc).toContain('"running"');
      expect(loc).toContain('"exportLog"');
    }
  });

  it("platform shell + open result use Tauri reveal", () => {
    const shell = readFileSync(join(uiSrc, "platform/shell.ts"), "utf8");
    expect(shell).toContain("shell_reveal_in_finder");
    expect(shell).toContain("shell_write_text_file");
    const open = readFileSync(join(uiSrc, "lib/jobOpenResult.ts"), "utf8");
    expect(open).toContain("revealInFileManager");
    const exportLog = readFileSync(join(uiSrc, "lib/jobLogExport.ts"), "utf8");
    expect(exportLog).toContain("writeTextFileAbsolute");
  });

  it("Rust shell helpers registered", () => {
    const lib = readFileSync(
      join(uiSrc, "../../../src-tauri/src/lib.rs"),
      "utf8",
    );
    expect(lib).toContain("shell_reveal_in_finder");
    expect(lib).toContain("shell_write_text_file");
  });

  it("api/jobs exposes retry and incremental log", () => {
    const text = readFileSync(join(uiSrc, "api/jobs.ts"), "utf8");
    expect(text).toContain("retryJob");
    expect(text).toContain("fetchJobLogSince");
    expect(text).toContain("command_line");
    expect(text).toContain("progress");
  });
});
