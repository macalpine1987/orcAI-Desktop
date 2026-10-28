import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { ORCAI_DEFAULT_DURATION_LIMITS } from "../lib/callDurationLimits";
import type { PredictQueueFile } from "../workspace/predictQueue";
import { PredictFilterStudio } from "./PredictFilterStudio";
import { pickJsonOutputFile } from "../platform/dialog";

const fetchFilterDefaults = vi.fn();
const fetchFilterPreview = vi.fn();
const readTextFile = vi.fn();
const writeTextFile = vi.fn();

vi.mock("../api/filterPreview", () => ({
  fetchFilterDefaults: (...args: unknown[]) => fetchFilterDefaults(...args),
  fetchFilterPreview: (...args: unknown[]) => fetchFilterPreview(...args),
  readTextFile: (...args: unknown[]) => readTextFile(...args),
  writeTextFile: (...args: unknown[]) => writeTextFile(...args),
}));

vi.mock("../platform/dialog", () => ({
  pickJsonFile: vi.fn(),
  pickJsonOutputFile: vi.fn(),
  basename: (path: string) => path.split("/").pop() ?? path,
}));

vi.mock("../api/fs", () => ({
  pathExists: vi.fn(async () => false),
}));

const wav: PredictQueueFile = {
  name: "a.wav",
  path: "/proj/a.wav",
  kind: "wav",
  bit_depth: 16,
  sample_rate_hz: 48_000,
  duration_sec: 120,
  status: "done",
  labelPath: "/proj/a_c1_orcai-isl-v1_predicted.txt",
};

describe("PredictFilterStudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchFilterDefaults.mockResolvedValue(ORCAI_DEFAULT_DURATION_LIMITS);
    readTextFile.mockResolvedValue(null);
    writeTextFile.mockResolvedValue("/proj/Ferop_call_duration_limits.json");
    fetchFilterPreview.mockResolvedValue({
      total: { found: 3, keep: 2, drop: 1 },
      classes: [
        {
          label: "WHISTLE",
          found: 2,
          keep: 1,
          drop: 1,
          durations: [0.5, 0.02],
        },
      ],
      files_ok: 1,
      files_missing: [],
    });
  });

  it("warns on no-op defaults and writes limits JSON before apply", async () => {
    const onApply = vi.fn();
    const { container, unmount } = renderWithProviders(
      <PredictFilterStudio
        sources={[{ file: wav, predictedPath: wav.labelPath! }]}
        activePredictedPath={wav.labelPath!}
        onSelectPredictedPath={vi.fn()}
        limitsPath="/proj/Ferop_call_duration_limits.json"
        labelSuffix="*"
        filterSettings={{ outputFile: "default", overwrite: false }}
        onFilterSettingsChange={vi.fn()}
        orcaiReady
        batchRunning={false}
        filterSubmitting={false}
        onApply={onApply}
      />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toMatch(/\[0, null\]/);
    expect(container.textContent).toMatch(/filter-predictions/);
    expect(container.textContent).not.toMatch(/Только предпросмотр|Preview only/);
    expect(
      container.querySelectorAll(".pp-footer-btns button"),
    ).toHaveLength(1);
    expect(container.querySelector(".pp-cmd-lcd")).toBeTruthy();
    expect(container.querySelector(".predict-filter-m05-right .predict-filter-track-bar")).toBeTruthy();

    const pub = Array.from(container.querySelectorAll("button")).find((b) =>
      /orcAI-v1|публикации|Пример/i.test(b.textContent ?? ""),
    );
    expect(pub).toBeTruthy();
    await act(async () => {
      pub!.click();
    });
    expect(container.textContent).not.toMatch(/\[0, null\]/);

    const apply = Array.from(container.querySelectorAll("button")).find((b) =>
      /Применить фильтр|Apply filter/i.test(b.textContent ?? ""),
    );
    expect(apply).toBeTruthy();
    await act(async () => {
      apply!.click();
      await Promise.resolve();
    });
    expect(writeTextFile).toHaveBeenCalled();
    const written = String(writeTextFile.mock.calls[0]?.[1] ?? "");
    expect(written).toContain("null");
    expect(written).toContain("0.1");
    expect(onApply).toHaveBeenCalledWith(
      [wav.labelPath],
      "/proj/Ferop_call_duration_limits.json",
    );
    unmount();
  });

  it("Apply uses the JSON path from Save as, not the prop limitsPath", async () => {
    vi.mocked(pickJsonOutputFile).mockResolvedValue("/tmp/custom_limits.json");
    const onApply = vi.fn();
    const { container, unmount } = renderWithProviders(
      <PredictFilterStudio
        sources={[{ file: wav, predictedPath: wav.labelPath! }]}
        activePredictedPath={wav.labelPath!}
        onSelectPredictedPath={vi.fn()}
        limitsPath="/proj/Ferop_call_duration_limits.json"
        labelSuffix="*"
        filterSettings={{ outputFile: "default", overwrite: false }}
        onFilterSettingsChange={vi.fn()}
        orcaiReady
        batchRunning={false}
        filterSubmitting={false}
        onApply={onApply}
      />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const save = Array.from(container.querySelectorAll("button")).find((b) =>
      /Сохранить|Save/i.test(b.textContent ?? ""),
    );
    expect(save).toBeTruthy();
    await act(async () => {
      save!.click();
      await Promise.resolve();
    });

    const apply = Array.from(container.querySelectorAll("button")).find((b) =>
      /Применить фильтр|Apply filter/i.test(b.textContent ?? ""),
    );
    await act(async () => {
      apply!.click();
      await Promise.resolve();
    });
    expect(onApply).toHaveBeenCalledWith(
      [wav.labelPath],
      "/tmp/custom_limits.json",
    );
    unmount();
  });

  it("keeps a decimal point or comma while typing 0.06", async () => {
    const { container, unmount } = renderWithProviders(
      <PredictFilterStudio
        sources={[{ file: wav, predictedPath: wav.labelPath! }]}
        activePredictedPath={wav.labelPath!}
        onSelectPredictedPath={vi.fn()}
        limitsPath="/proj/Ferop_call_duration_limits.json"
        labelSuffix="*"
        filterSettings={{ outputFile: "default", overwrite: false }}
        onFilterSettingsChange={vi.fn()}
        orcaiReady
        batchRunning={false}
        filterSubmitting={false}
        onApply={vi.fn()}
      />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const min = container.querySelector<HTMLInputElement>('input[aria-label="default min"]');
    expect(min).toBeTruthy();
    await setInputValue(min!, "0.");
    expect(min!.value).toBe("0.");
    await setInputValue(min!, "0.06");
    expect(min!.value).toBe("0.06");
    await setInputValue(min!, "0,06");
    expect(min!.value).toBe("0,06");
    unmount();
  });
});

async function setInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const propsKey = Object.keys(input).find((k) => k.startsWith("__reactProps$"));
    const props = propsKey
      ? (input as unknown as Record<string, { onChange?: (e: { target: HTMLInputElement }) => void }>)[
          propsKey
        ]
      : null;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(
      input,
      value,
    );
    props?.onChange?.({ target: input });
  });
}
