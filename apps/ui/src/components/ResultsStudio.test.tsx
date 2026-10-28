import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ResultsSummaryResponse, ResultsSummaryRow } from "../api/results";
import { renderWithProviders } from "../test/render";
import { ResultsStudio } from "./ResultsStudio";

function row(
  partial: Partial<ResultsSummaryRow> & Pick<ResultsSummaryRow, "id" | "label">,
): ResultsSummaryRow {
  return {
    recording: "a.wav",
    wav_path: "/proj/a.wav",
    label_path: "/proj/a_c1_orcai-isl-v1_predicted.txt",
    start_sec: 1,
    stop_sec: 2,
    duration_sec: 1,
    mean_p: 0.9,
    model: "orcai-isl-v1",
    channel: 1,
    kind: "predicted",
    ...partial,
  };
}

function summary(
  over: Partial<ResultsSummaryResponse> = {},
): ResultsSummaryResponse {
  const rows = over.rows ?? [
    row({
      id: "/proj/a:1.000000:2.000000:WHISTLE:0",
      label: "WHISTLE",
      recording: "a.wav",
      mean_p: 0.9,
    }),
    row({
      id: "/proj/b:2.000000:3.000000:BUZZ:1",
      label: "BUZZ",
      recording: "b.wav",
      wav_path: "/proj/b.wav",
      label_path: "/proj/b_c1_orcai-isl-v1_predicted.txt",
      start_sec: 2,
      stop_sec: 3,
      mean_p: 0.2,
    }),
  ];
  return {
    source: "predicted",
    scan_dir: "/proj",
    files_total: 1,
    files_ok: 1,
    truncated: false,
    files_failed: 0,
    summary: {
      detection_count: rows.length,
      recording_count: 2,
      duration_sec: 18 * 60 + 24,
      mean_p: 0.7,
      models: ["orcai-isl-v1"],
      thresholds: [0.5],
    },
    classes: [
      { label: "WHISTLE", count: 1, duration_sec: 1 },
      { label: "BUZZ", count: 1, duration_sec: 1 },
    ],
    recordings: ["a.wav", "b.wav"],
    rows,
    ...over,
  };
}

async function setInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const propsKey = Object.keys(input).find((k) => k.startsWith("__reactProps$"));
    const props = propsKey
      ? (input as unknown as Record<
          string,
          { onChange?: (e: { target: HTMLInputElement }) => void }
        >)[propsKey]
      : null;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(
      input,
      value,
    );
    props?.onChange?.({ target: input });
  });
}

type FiberNode = {
  child?: FiberNode | null;
  sibling?: FiberNode | null;
  return?: FiberNode | null;
  stateNode?: EventTarget | null;
  memoizedProps?: { onChange?: (e: { target: HTMLSelectElement }) => void };
  pendingProps?: { onChange?: (e: { target: HTMLSelectElement }) => void };
};

function reactFiber(el: Element): FiberNode | undefined {
  const key =
    Object.keys(el).find((k) => k.startsWith("__reactFiber$")) ??
    Object.getOwnPropertyNames(el).find((k) => k.startsWith("__reactFiber$"));
  return key ? (el as unknown as Record<string, FiberNode>)[key] : undefined;
}

function findHostFiber(from: FiberNode | undefined, host: Element): FiberNode | undefined {
  if (!from) return undefined;
  const queue: FiberNode[] = [from];
  const seen = new Set<FiberNode>();
  while (queue.length) {
    const fiber = queue.shift();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);
    if (fiber.stateNode === host) return fiber;
    if (fiber.child) queue.push(fiber.child);
    if (fiber.sibling) queue.push(fiber.sibling);
  }
  return undefined;
}

function selectOnChange(
  select: HTMLSelectElement,
): ((e: { target: HTMLSelectElement }) => void) | undefined {
  const start =
    reactFiber(select) ??
    [...select.parentElement?.querySelectorAll("input,button") ?? []].map(reactFiber).find(Boolean) ??
    (select.parentElement ? reactFiber(select.parentElement) : undefined);
  let root = start;
  for (let i = 0; i < 12 && root?.return; i += 1) root = root.return;
  const fiber = findHostFiber(root, select) ?? findHostFiber(start, select);
  return fiber?.memoizedProps?.onChange ?? fiber?.pendingProps?.onChange;
}

async function setSelectValue(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    selectOnChange(select)?.({ target: select });
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function kpiValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".results-kpi-value")).map(
    (el) => el.textContent ?? "",
  );
}

function tableFiles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".results-table tbody .results-td-file")).map(
    (el) => el.textContent ?? "",
  );
}

function classCodes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".results-class-code")).map(
    (el) => el.textContent ?? "",
  );
}

function unfilteredSummary(): ResultsSummaryResponse {
  return summary({
    summary: {
      detection_count: 2,
      recording_count: 2,
      duration_sec: 18 * 60 + 24,
      mean_p: 0.7,
      models: ["orcai-isl-v1"],
      thresholds: [],
    },
  });
}

describe("Results studio · T-6 / regression", () => {
  it("T-6.1 KPIs follow the visible table (five cells, no model KPI)", () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={unfilteredSummary()}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".results-kpi-cell")).toHaveLength(5);
    expect(kpiValues(container)).toEqual(["2", "2", "00:02", "0.55", "—"]);
    expect(container.textContent).not.toMatch(/orcai-isl-v1/);
    expect(classCodes(container).sort()).toEqual(["BUZZ", "WHISTLE"]);
    expect(container.querySelectorAll(".predict-results-page-btn--filled")).toHaveLength(2);
    unmount();
  });

  it("KPI strip and class chart follow file and class filters", async () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary()}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    const minProb = container.querySelector(".results-filter-prob input") as HTMLInputElement;
    await setInputValue(minProb, "");

    expect(kpiValues(container)).toEqual(["2", "2", "00:02", "0.55", "0.50"]);
    expect(classCodes(container).sort()).toEqual(["BUZZ", "WHISTLE"]);

    const recording = container.querySelectorAll(
      ".results-table-filters select",
    )[0] as HTMLSelectElement;
    const classSelect = container.querySelectorAll(
      ".results-table-filters select",
    )[1] as HTMLSelectElement;

    await setSelectValue(recording, "a.wav");
    expect(kpiValues(container)).toEqual(["1", "1", "00:01", "0.90", "0.50"]);
    expect(classCodes(container)).toEqual(["WHISTLE"]);
    expect(container.querySelector(".results-class-count")?.textContent).toBe("1");

    await setSelectValue(recording, "");
    await setSelectValue(classSelect, "BUZZ");
    expect(kpiValues(container)).toEqual(["1", "1", "00:01", "0.20", "0.50"]);
    expect(classCodes(container).sort()).toEqual(["BUZZ", "WHISTLE"]);
    const buzzCol = Array.from(container.querySelectorAll(".results-class-col")).find((el) =>
      /BUZZ/.test(el.textContent ?? ""),
    );
    const whistleCol = Array.from(container.querySelectorAll(".results-class-col")).find((el) =>
      /WHISTLE/.test(el.textContent ?? ""),
    );
    expect(buzzCol?.classList.contains("is-selected")).toBe(true);
    expect(buzzCol?.classList.contains("is-muted")).toBe(false);
    expect(whistleCol?.classList.contains("is-muted")).toBe(true);
    unmount();
  });

  it("auto-sorts the table by filename, then time within a file", () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary({
          summary: {
            detection_count: 3,
            recording_count: 2,
            duration_sec: 3,
            mean_p: 0.9,
            models: ["orcai-isl-v1"],
            thresholds: [],
          },
          recordings: ["07 Fjord Echo.wav", "01 Just Passing Through.wav"],
          rows: [
            row({
              id: "fjord",
              label: "WHISTLE",
              recording: "07 Fjord Echo.wav",
              wav_path: "/proj/07.wav",
              start_sec: 3,
              stop_sec: 4,
            }),
            row({
              id: "late",
              label: "BUZZ",
              recording: "01 Just Passing Through.wav",
              start_sec: 80,
              stop_sec: 81,
            }),
            row({
              id: "early",
              label: "WHISTLE",
              recording: "01 Just Passing Through.wav",
              start_sec: 14,
              stop_sec: 15,
            }),
          ],
        })}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    expect(tableFiles(container)).toEqual([
      "01 Just Passing Through.wav",
      "01 Just Passing Through.wav",
      "07 Fjord Echo.wav",
    ]);
    const starts = Array.from(container.querySelectorAll(".results-table-row td:nth-child(2)")).map(
      (el) => el.textContent,
    );
    expect(starts[0]).toMatch(/00:14/);
    expect(starts[1]).toMatch(/01:20/);
    const active = container.querySelector(".results-table thead button.is-active");
    expect(active?.textContent).toMatch(/Файл|File/);
    unmount();
  });

  it("T-6.2 table filters narrow rows; CSV export is the visible subset", async () => {
    const onExportCsv = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary()}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={onExportCsv}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    // Default minProb = first predict threshold (0.50) → BUZZ 0.2 is hidden.
    expect(tableFiles(container)).toEqual(["a.wav"]);
    expect(container.textContent).toMatch(/1 из 2|1 of 2/);

    const recording = container.querySelectorAll(
      ".results-table-filters select",
    )[0] as HTMLSelectElement;
    await setSelectValue(recording, "a.wav");
    expect(tableFiles(container)).toEqual(["a.wav"]);

    const csvBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /Экспорт CSV|Export CSV/i.test(b.textContent ?? ""),
    );
    expect(csvBtn).toBeTruthy();
    await act(async () => {
      csvBtn!.click();
    });
    expect(onExportCsv).toHaveBeenCalledTimes(1);
    const exported = onExportCsv.mock.calls[0]?.[0] as ResultsSummaryRow[];
    expect(exported.map((r) => r.recording)).toEqual(["a.wav"]);
    expect(exported.map((r) => r.label)).toEqual(["WHISTLE"]);
    unmount();
  });

  it("T-6.3 Audacity export is grouped from the visible rows", async () => {
    const onExportAudacity = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary({
          summary: {
            detection_count: 2,
            recording_count: 2,
            duration_sec: 2,
            mean_p: 0.9,
            models: ["orcai-isl-v1"],
            thresholds: [],
          },
        })}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={onExportAudacity}
        onOpenDetection={vi.fn()}
      />,
    );
    expect(tableFiles(container)).toEqual(["a.wav", "b.wav"]);
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      /Audacity/i.test(b.textContent ?? ""),
    );
    await act(async () => {
      btn!.click();
    });
    const exported = onExportAudacity.mock.calls[0]?.[0] as ResultsSummaryRow[];
    expect(exported.map((r) => r.recording).sort()).toEqual(["a.wav", "b.wav"]);
    unmount();
  });

  it("T-6.4 row open sends the same file, interval and label", async () => {
    const onOpenDetection = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary()}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={onOpenDetection}
      />,
    );
    const open = container.querySelector(".results-action-link") as HTMLButtonElement;
    await act(async () => {
      open.click();
    });
    expect(onOpenDetection).toHaveBeenCalledWith(
      expect.objectContaining({
        recording: "a.wav",
        wav_path: "/proj/a.wav",
        label: "WHISTLE",
        start_sec: 1,
        stop_sec: 2,
      }),
    );
    unmount();
  });

  it("T-6.5 source pills request predicted / filtered / annotations", async () => {
    const onSourceChange = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary()}
        source="predicted"
        onSourceChange={onSourceChange}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    const pills = Array.from(
      container.querySelectorAll(".results-source-toggle button"),
    ) as HTMLButtonElement[];
    expect(pills).toHaveLength(3);
    expect(pills.every((btn) => btn.classList.contains("predict-tab"))).toBe(true);
    expect(pills[0]?.getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      pills[1]!.click();
    });
    await act(async () => {
      pills[2]!.click();
    });
    expect(onSourceChange.mock.calls.map((c) => c[0])).toEqual(["filtered", "annotations"]);
    unmount();
  });

  it("BR-002 annotations keep rows with null mean_p and do not seed minProb", () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary({
          source: "annotations",
          summary: {
            detection_count: 2,
            recording_count: 2,
            duration_sec: 2,
            mean_p: null,
            models: [],
            thresholds: [0.5],
          },
          rows: [
            row({
              id: "ann-1",
              label: "WHISTLE",
              mean_p: null,
              kind: "annotation",
            }),
            row({
              id: "ann-2",
              label: "BUZZ",
              recording: "b.wav",
              mean_p: 0.2,
              kind: "annotation",
            }),
          ],
        })}
        source="annotations"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    const prob = container.querySelector(".results-filter-prob input") as HTMLInputElement;
    expect(prob.value).toBe("");
    expect(tableFiles(container)).toEqual(["a.wav", "b.wav"]);
    unmount();
  });

  it("does not seed minProb on filtered source so duration-kept rows stay visible", () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary({
          source: "filtered",
          summary: {
            detection_count: 2,
            recording_count: 2,
            duration_sec: 2,
            mean_p: 0.55,
            models: ["orcai-isl-v1"],
            thresholds: [0.5],
          },
          rows: [
            row({
              id: "hi",
              label: "WHISTLE",
              mean_p: 0.9,
              kind: "filtered",
            }),
            row({
              id: "lo",
              label: "BUZZ",
              recording: "b.wav",
              mean_p: 0.2,
              kind: "filtered",
            }),
          ],
        })}
        source="filtered"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    const prob = container.querySelector(".results-filter-prob input") as HTMLInputElement;
    expect(prob.value).toBe("");
    expect(tableFiles(container)).toEqual(["a.wav", "b.wav"]);
    unmount();
  });

  it("keeps the selected class highlighted when minProb hides all of its rows", async () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary()}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    const classSelect = container.querySelectorAll(
      ".results-table-filters select",
    )[1] as HTMLSelectElement;
    await setSelectValue(classSelect, "BUZZ");
    expect(kpiValues(container)[0]).toBe("0");
    const buzzCol = Array.from(container.querySelectorAll(".results-class-col")).find((el) =>
      /BUZZ/.test(el.textContent ?? ""),
    );
    const whistleCol = Array.from(container.querySelectorAll(".results-class-col")).find((el) =>
      /WHISTLE/.test(el.textContent ?? ""),
    );
    expect(buzzCol?.classList.contains("is-selected")).toBe(true);
    expect(buzzCol?.querySelector(".results-class-count")?.textContent).toBe("0");
    expect(whistleCol?.classList.contains("is-muted")).toBe(true);
    unmount();
  });

  it("BR-004/005 truncated and files_failed notices are visible", () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary({ truncated: true, files_failed: 2 })}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    expect(container.textContent).toMatch(/первые|first/i);
    expect(container.textContent).toMatch(/Пропущены 2|Skipped 2/);
    unmount();
  });

  it("BR-007 duplicate intervals still render as separate rows", () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary({
          summary: {
            detection_count: 2,
            recording_count: 1,
            duration_sec: 2,
            mean_p: 0.9,
            models: ["orcai-isl-v1"],
            thresholds: [],
          },
          recordings: ["a.wav"],
          rows: [
            row({ id: "/proj/a:1:2:WHISTLE:0", label: "WHISTLE" }),
            row({ id: "/proj/a:1:2:WHISTLE:1", label: "WHISTLE" }),
          ],
        })}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".results-table-row")).toHaveLength(2);
    unmount();
  });

  it("filename search filters the visible table", async () => {
    const { container, unmount } = renderWithProviders(
      <ResultsStudio
        data={summary({
          summary: {
            detection_count: 2,
            recording_count: 2,
            duration_sec: 2,
            mean_p: 0.9,
            models: ["orcai-isl-v1"],
            thresholds: [],
          },
        })}
        source="predicted"
        onSourceChange={vi.fn()}
        onExportCsv={vi.fn()}
        onExportAudacity={vi.fn()}
        onOpenDetection={vi.fn()}
      />,
    );
    const search = container.querySelector(".results-filter-search") as HTMLInputElement;
    await setInputValue(search, "b.wav");
    expect(tableFiles(container)).toEqual(["b.wav"]);
    unmount();
  });
});
