import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import type { JobRecord } from "../api/jobs";

vi.mock("../platform/tauri", () => ({
  isTauri: vi.fn(),
}));

const writeTextFileMock = vi.fn();
const saveMock = vi.fn();

vi.mock("../platform/shell", () => ({
  writeTextFileAbsolute: (...args: unknown[]) => writeTextFileMock(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => saveMock(...args),
}));

import { isTauri } from "../platform/tauri";
import {
  copyText,
  exportJobLogToFile,
  jobLogDefaultName,
  jobLogText,
} from "./jobLogExport";

function job(log: string[]): JobRecord {
  return {
    id: "abc12345-0000-0000-0000-000000000001",
    command: "predict",
    params: {},
    status: "completed",
    created_at: 0,
    updated_at: 0,
    log,
    result: null,
    error: null,
  };
}

describe("jobLogExport · extended", () => {
  beforeEach(() => {
    writeTextFileMock.mockReset();
    writeTextFileMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("jobLogText joins lines verbatim (no paraphrase)", () => {
    const lines = ["Running orcAI: predict", "Predicting calls", "done."];
    expect(jobLogText(job(lines))).toBe(lines.join("\n"));
  });

  it("jobLogText uses explicit lines override", () => {
    expect(jobLogText(job(["old"]), ["new"])).toBe("new");
  });

  it("jobLogDefaultName is deterministic", () => {
    const j = job(["line1"]);
    expect(jobLogDefaultName(j)).toBe("orcai-job-predict-abc12345.log");
  });

  it("copyText writes to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("copyText returns false on clipboard error", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    expect(await copyText("x")).toBe(false);
  });

  it("exportJobLogToFile uses Tauri save + write when in app", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    saveMock.mockResolvedValue("/tmp/export.log");

    const ok = await exportJobLogToFile(job(["a", "b"]));
    expect(ok).toBe(true);
    expect(saveMock).toHaveBeenCalled();
    expect(writeTextFileMock).toHaveBeenCalledWith(
      "/tmp/export.log",
      "a\nb",
    );
  });

  it("exportJobLogToFile returns false when save dialog cancelled", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    expect(await exportJobLogToFile(job(["x"]))).toBe(false);
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });

  it("exportJobLogToFile browser fallback creates download", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const click = vi.fn();
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: revoke,
    });
    vi.stubGlobal(
      "document",
      {
        createElement: vi.fn(() => ({
          href: "",
          download: "",
          click,
        })),
      },
    );
    expect(await exportJobLogToFile(job(["line"]))).toBe(true);
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });
});
