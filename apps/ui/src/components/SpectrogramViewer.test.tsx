import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "../test/render";
import type { LabelsPreview } from "../api/labels";
import type { SpectrogramMeta } from "../api/spectrogram";

const {
  fetchLabelsPreviewMock,
  spectrogramTileUrlMock,
  useSidecarStatusMock,
} = vi.hoisted(() => ({
  fetchLabelsPreviewMock: vi.fn(),
  spectrogramTileUrlMock: vi.fn(
    (p: { _epoch?: number; display_kind?: string; colormap?: string }) =>
      `https://tile.test/png?kind=${p.display_kind ?? "linear"}&cmap=${p.colormap ?? "inferno"}&e=${p._epoch ?? 0}`,
  ),
  useSidecarStatusMock: vi.fn(),
}));

vi.mock("../api/labels", () => ({
  fetchLabelsPreview: fetchLabelsPreviewMock,
  exportAudacityLabels: vi.fn(),
}));

vi.mock("../api/spectrogram", () => ({
  fetchSpectrogramMeta: vi.fn(),
  spectrogramTileUrl: spectrogramTileUrlMock,
}));

vi.mock("../hooks/useSidecarStatus", () => ({
  useSidecarStatus: useSidecarStatusMock,
}));

vi.mock("./SpectrogramAudioPlayer", () => ({
  SpectrogramAudioPlayer: () => <div data-testid="audio-player" />,
}));

import { SpectrogramViewer } from "./SpectrogramViewer";

const meta: SpectrogramMeta = {
  path: "/tmp/rec.wav",
  duration_sec: 400,
  sample_rate: 16_000,
  channels: 1,
};

const labelsPreview: LabelsPreview = {
  path: "/tmp/labels.txt",
  wav_path: "/tmp/rec.wav",
  delta_t: 0.05,
  time_unit: "seconds",
  segment_count: 1,
  labels: { call: 1 },
  segments: [
    {
      start: 10,
      stop: 12,
      label: "call",
      mean_p: 0.88,
      label_source: "orcai",
      start_sec: 10,
      stop_sec: 12,
      hz_min: 400,
      hz_max: 3200,
    },
  ],
  tf_bounds: { computed: 1, skipped: 0, warnings: [] },
};

async function flush(ms = 50) {
  await new Promise((r) => setTimeout(r, ms));
}

describe("SpectrogramViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () =>
          Promise.resolve(
            new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
          ),
      }),
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-tile"),
      revokeObjectURL: vi.fn(),
    });
    useSidecarStatusMock.mockReturnValue({ sidecarPort: 17890 });
    fetchLabelsPreviewMock.mockResolvedValue(labelsPreview);
    localStorage.clear();
  });

  it("renders pro-lab toolbar and spectrogram tile with display kind", async () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramViewer
        wavPath="/tmp/rec.wav"
        meta={meta}
        labelPath="/tmp/labels.txt"
        layout="proLab"
      />,
    );
    await flush(100);
    expect(
      container.querySelector('[aria-label*="Spectrogram toolbar" i], [aria-label*="Панель инструментов" i]'),
    ).toBeTruthy();
    expect(fetchLabelsPreviewMock).toHaveBeenCalledWith(
      "/tmp/labels.txt",
      expect.objectContaining({ wavPath: "/tmp/rec.wav" }),
    );
    expect(spectrogramTileUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ display_kind: "orcai", colormap: "gray" }),
    );
    unmount();
  });

  it("always requests orcai spectrogram tiles", async () => {
    const { unmount } = renderWithProviders(
      <SpectrogramViewer
        wavPath="/tmp/rec.wav"
        meta={meta}
        labelPath="/tmp/labels.txt"
        layout="proLab"
      />,
    );
    await flush(150);
    expect(spectrogramTileUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ display_kind: "orcai", colormap: "gray" }),
    );
    unmount();
  });

  it("shows TF bounds notice when segments were skipped", async () => {
    fetchLabelsPreviewMock.mockResolvedValue({
      ...labelsPreview,
      tf_bounds: { computed: 1, skipped: 3, warnings: [] },
    });
    const { container, unmount } = renderWithProviders(
      <SpectrogramViewer
        wavPath="/tmp/rec.wav"
        meta={meta}
        labelPath="/tmp/labels.txt"
        layout="proLab"
      />,
    );
    await flush(150);
    expect(container.textContent).toMatch(
      /TF boxes:.*1 with frequency bounds.*3 without|TF-рамки:.*1 с частотными границами.*3 без/i,
    );
    unmount();
  });
});
