import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

vi.mock("./tauri", () => ({
  isTauri: vi.fn(),
}));

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { isTauri } from "./tauri";
import { revealInFileManager, writeTextFileAbsolute } from "./shell";

describe("platform/shell · ", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("revealInFileManager invokes Tauri command", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const ok = await revealInFileManager("/tmp/out.txt");
    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("shell_reveal_in_finder", {
      path: "/tmp/out.txt",
    });
  });

  it("revealInFileManager falls back to clipboard in dev", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ok = await revealInFileManager("/tmp/out.txt");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("/tmp/out.txt");
  });

  it("revealInFileManager returns false when clipboard fails", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    expect(await revealInFileManager("/tmp/out.txt")).toBe(false);
  });

  it("writeTextFileAbsolute returns false outside Tauri", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    expect(await writeTextFileAbsolute("/x.log", "body")).toBe(false);
  });

  it("writeTextFileAbsolute invokes shell_write_text_file", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const ok = await writeTextFileAbsolute("/save/job.log", "line1\nline2");
    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("shell_write_text_file", {
      path: "/save/job.log",
      contents: "line1\nline2",
    });
  });
});
