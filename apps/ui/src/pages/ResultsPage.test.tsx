import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ResultsSource, ResultsSummaryResponse, ResultsSummaryRow } from "../api/results";
import { renderWithProviders } from "../test/render";
import { SaveNoticeProvider } from "../ui/saveNotice";
import { saveWorkspace } from "../workspace/storage";

const navigateMock = vi.hoisted(() => vi.fn());
const sidecar = vi.hoisted(() => ({
  online: true,
  engineReady: true,
}));
const fetchResultsSummary = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../hooks/useSidecarStatus", () => ({
  useSidecarStatus: () => ({
    online: sidecar.online,
    engineReady: sidecar.engineReady,
    sidecarPort: 18741,
    capabilities: null,
  }),
}));

vi.mock("../api/results", async () => {
  const actual = await vi.importActual<typeof import("../api/results")>("../api/results");
  return {
    ...actual,
    fetchResultsSummary: (...args: unknown[]) => fetchResultsSummary(...args),
  };
});

import { ResultsPage } from "./ResultsPage";

function row(
  partial: Partial<ResultsSummaryRow> & Pick<ResultsSummaryRow, "id" | "label" | "kind">,
): ResultsSummaryRow {
  return {
    recording: "a.wav",
    wav_path: "/proj/a.wav",
    label_path: "/proj/a_c1_orcai-isl-v1_predicted.txt",
    start_sec: 12.5,
    stop_sec: 14,
    duration_sec: 1.5,
    mean_p: 0.88,
    model: "orcai-isl-v1",
    channel: 1,
    ...partial,
  };
}

function payload(
  source: ResultsSource,
  over: Partial<ResultsSummaryResponse> = {},
): ResultsSummaryResponse {
  const kind = source === "annotations" ? "annotation" : source;
  const rows = over.rows ?? [
    row({
      id: `${source}-0`,
      label: source === "filtered" ? "BUZZ" : "WHISTLE",
      kind,
    }),
  ];
  return {
    source,
    scan_dir: "/proj",
    files_total: 1,
    files_ok: 1,
    truncated: false,
    files_failed: 0,
    summary: {
      detection_count: rows.length,
      recording_count: 1,
      duration_sec: 1.5,
      mean_p: 0.88,
      models: ["orcai-isl-v1"],
      thresholds: [0.5],
    },
    classes: [{ label: rows[0]!.label, count: 1, duration_sec: 1.5 }],
    recordings: ["a.wav"],
    rows,
    ...over,
  };
}

function seedWorkspace(projectDir = "/proj") {
  saveWorkspace({
    activeProjectId: "p1",
    activeProjectKind: "recognition",
    projectDir,
    projectName: "Fjord",
    recordingTablePath: `${projectDir}/recording_table.csv`,
  });
}

async function flushUi() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <SaveNoticeProvider>
        <ResultsPage />
      </SaveNoticeProvider>
    </MemoryRouter>,
  );
}

describe("Results page · T-6 / regression", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    fetchResultsSummary.mockReset();
    sidecar.online = true;
    sidecar.engineReady = true;
    seedWorkspace();
  });

  it("T-6.1 loads predicted summary for the workspace project", async () => {
    fetchResultsSummary.mockResolvedValue(payload("predicted"));
    const { container, unmount } = renderPage();
    await flushUi();
    expect(fetchResultsSummary).toHaveBeenCalledWith({
      projectDir: "/proj",
      source: "predicted",
    });
    expect(container.querySelector(".results-studio")).toBeTruthy();
    expect(container.querySelector(".results-kpi-value")?.textContent).toBe("1");
    unmount();
  });

  it("T-6.4 Open writes workspace paths and navigates to Analysis at the same interval", async () => {
    fetchResultsSummary.mockResolvedValue(payload("predicted"));
    const { container, unmount } = renderPage();
    await flushUi();
    const open = container.querySelector(".results-action-link") as HTMLButtonElement;
    await act(async () => {
      open.click();
    });
    expect(navigateMock).toHaveBeenCalledWith("/predict", {
      state: {
        tab: "results",
        labelPath: "/proj/a_c1_orcai-isl-v1_predicted.txt",
        wavPath: "/proj/a.wav",
        focusStartSec: 12.5,
        focusEndSec: 14,
        focusLabel: "WHISTLE",
      },
    });
    unmount();
  });

  it("T-6.5 / BR-006 source switch hides stale predicted rows until filtered arrives", async () => {
    let resolveFiltered: ((value: ResultsSummaryResponse) => void) | undefined;
    fetchResultsSummary.mockImplementation(({ source }: { source: ResultsSource }) => {
      if (source === "predicted") return Promise.resolve(payload("predicted"));
      return new Promise<ResultsSummaryResponse>((resolve) => {
        resolveFiltered = resolve;
      });
    });
    const { container, unmount } = renderPage();
    await flushUi();
    expect(container.textContent).toContain("WHISTLE");

    const filteredPill = Array.from(
      container.querySelectorAll(".results-source-toggle button"),
    ).find((b) => /После фильтра|Filtered/i.test(b.textContent ?? ""));
    expect(filteredPill).toBeTruthy();
    await act(async () => {
      filteredPill!.click();
    });
    expect(container.querySelector(".results-studio")).toBeNull();
    expect(container.textContent).not.toContain("WHISTLE");
    expect(container.textContent).toMatch(/Загрузка|Loading/);

    await act(async () => {
      resolveFiltered?.(payload("filtered"));
      await Promise.resolve();
    });
    await flushUi();
    expect(container.querySelector(".results-studio")).toBeTruthy();
    expect(container.textContent).toContain("BUZZ");
    expect(container.textContent).not.toContain("WHISTLE");
    unmount();
  });

  it("BR-003 changing the workspace project hides stale rows until the new summary arrives", async () => {
    let resolveOther: ((value: ResultsSummaryResponse) => void) | undefined;
    fetchResultsSummary.mockImplementation(({ projectDir }: { projectDir: string }) => {
      if (projectDir === "/proj") return Promise.resolve(payload("predicted"));
      return new Promise<ResultsSummaryResponse>((resolve) => {
        resolveOther = resolve;
      });
    });
    const { container, unmount } = renderPage();
    await flushUi();
    expect(container.textContent).toContain("WHISTLE");
    expect(fetchResultsSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      saveWorkspace({ projectDir: "/other" });
      await Promise.resolve();
    });
    await flushUi();
    expect(fetchResultsSummary).toHaveBeenCalledWith({
      projectDir: "/other",
      source: "predicted",
    });
    expect(container.querySelector(".results-studio")).toBeNull();
    expect(container.textContent).not.toContain("WHISTLE");
    expect(container.textContent).toMatch(/Загрузка|Loading/);

    await act(async () => {
      resolveOther?.(
        payload("predicted", {
          scan_dir: "/other",
          rows: [
            row({
              id: "other-0",
              label: "BR",
              kind: "predicted",
              recording: "other.wav",
            }),
          ],
        }),
      );
      await Promise.resolve();
    });
    await flushUi();
    expect(container.querySelector(".results-studio")).toBeTruthy();
    expect(container.textContent).toContain("BR");
    expect(container.textContent).not.toContain("WHISTLE");
    unmount();
  });

  it("BR-008 sidecar vs engine copy is distinct", async () => {
    sidecar.online = false;
    sidecar.engineReady = false;
    const offline = renderPage();
    expect(offline.container.textContent).toMatch(/sidecar/i);
    expect(offline.container.textContent).not.toMatch(/движок orcAI на главной|engine from the Home/i);
    offline.unmount();

    sidecar.online = true;
    sidecar.engineReady = false;
    const noEngine = renderPage();
    expect(noEngine.container.textContent).toMatch(/движок orcAI на главной|engine from the Home/i);
    expect(noEngine.container.querySelector(".results-studio")).toBeNull();
    noEngine.unmount();
  });
});
