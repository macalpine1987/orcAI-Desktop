import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPredictTrackMeta } from "../lib/predictTrackMeta";
import type { PredictedFilterSource } from "./PredictFilterStudio";
import { SpectrogramFileSegmentRail } from "./SpectrogramFileSegmentRail";

type Props = {
  sources: PredictedFilterSource[];
  activePredictedPath: string;
  channel: number;
  disabled?: boolean;
  onSelectPredictedPath: (path: string) => void;
};

/**
 * Filter-tab current track — same Analysis segment rail (fileNavOnly),
 * stacked on the preview sidebar column so the two panels share an edge.
 */
export function PredictFilterTrackToolbar({
  sources,
  activePredictedPath,
  channel,
  disabled = false,
  onSelectPredictedPath,
}: Props) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = useMemo(() => {
    if (sources.length === 0) return null;
    return (
      sources.find((s) => s.predictedPath === activePredictedPath) ??
      sources[0] ??
      null
    );
  }, [sources, activePredictedPath]);

  const navIndex = selected
    ? sources.findIndex((s) => s.predictedPath === selected.predictedPath)
    : -1;
  const canPrev = navIndex > 0;
  const canNext = navIndex >= 0 && navIndex < sources.length - 1;

  const goRelative = useCallback(
    (delta: number) => {
      const next = sources[navIndex + delta];
      if (next) onSelectPredictedPath(next.predictedPath);
    },
    [navIndex, onSelectPredictedPath, sources],
  );

  const togglePicker = useCallback(() => {
    setPickerOpen((open) => !open);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const onFileMenuSelect = useCallback(
    (name: string) => {
      const hit = sources.find((s) => s.file.name === name);
      if (hit) onSelectPredictedPath(hit.predictedPath);
    },
    [onSelectPredictedPath, sources],
  );

  if (!selected) return null;

  const file = selected.file;
  const meta = formatPredictTrackMeta(file, channel, t);

  return (
    <div
      className="predict-filter-track-bar"
      role="group"
      data-spectrogram-chrome=""
    >
      <SpectrogramFileSegmentRail
        studioLayout
        fileNavOnly
        durationSec={0}
        viewStart={0}
        viewSpan={1}
        segmentIndex={0}
        onViewStartChange={() => {}}
        onSegmentSelect={() => {}}
        fileName={file.name}
        fileMeta={meta || null}
        onFileMenuToggle={togglePicker}
        onFileMenuClose={closePicker}
        fileMenuOpen={pickerOpen}
        fileMenuDisabled={disabled}
        fileMenuFiles={sources.map((s) => s.file)}
        fileMenuActiveName={file.name}
        onFileMenuSelect={onFileMenuSelect}
        onFilePrev={() => goRelative(-1)}
        onFileNext={() => goRelative(1)}
        canFilePrev={canPrev}
        canFileNext={canNext}
      />
    </div>
  );
}
