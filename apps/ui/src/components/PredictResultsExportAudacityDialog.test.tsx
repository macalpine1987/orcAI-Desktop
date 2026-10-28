import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { PredictResultsExportAudacityDialog } from "./PredictResultsExportAudacityDialog";
import type { PredictQueueFile } from "../workspace/predictQueue";

function wav(name: string): PredictQueueFile {
  return {
    name,
    path: `/p/${name}`,
    kind: "wav",
    status: "done",
  };
}

describe("PredictResultsExportAudacityDialog", () => {
  it("pre-checks the current file and exports the selection", () => {
    const onConfirm = vi.fn();
    const files = [wav("a.wav"), wav("b.wav"), wav("c.wav")];
    const { unmount } = renderWithProviders(
      <PredictResultsExportAudacityDialog
        open
        files={files}
        activeFileName="b.wav"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const root = document.body;
    const boxes = Array.from(
      root.querySelectorAll<HTMLInputElement>(
        '.predict-results-export-list input[type="checkbox"]',
      ),
    );
    expect(boxes).toHaveLength(3);
    expect(boxes[0]!.checked).toBe(false);
    expect(boxes[1]!.checked).toBe(true);
    expect(boxes[2]!.checked).toBe(false);

    const selectAll = Array.from(root.querySelectorAll("button")).find((b) =>
      /Выбрать все|Select all/i.test(b.textContent ?? ""),
    );
    expect(selectAll).toBeTruthy();
    act(() => {
      selectAll!.click();
    });
    expect(boxes.every((b) => b.checked)).toBe(true);

    act(() => {
      boxes[0]!.click();
    });

    const confirm = Array.from(root.querySelectorAll("button")).find((b) =>
      /Экспортировать|Export \(/i.test(b.textContent ?? ""),
    );
    expect(confirm).toBeTruthy();
    act(() => {
      confirm!.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const names = onConfirm.mock.calls[0]![0] as string[];
    expect(names.sort()).toEqual(["b.wav", "c.wav"]);
    unmount();
  });
});
