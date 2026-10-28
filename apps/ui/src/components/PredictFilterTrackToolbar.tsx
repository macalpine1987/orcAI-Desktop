import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPredictTrackMeta } from "../lib/predictTrackMeta";
import type { PredictedFilterSource } from "./PredictFilterStudio";
import { PredictResultsFilePickerModal } from "./PredictResultsFilePickerModal";
import {
  IconAudioFiles,
  IconChevronLeft,
  IconChevronRight,
  IconWaveform,
} from "./SpectrogramIcons";

type Props = {
  sources: PredictedFilterSource[];
  activePredictedPath: string;
  channel: number;
  disabled?: boolean;
  onSelectPredictedPath: (path: string) => void;
};

/**
 * Filter-tab current track — same file cluster as Analysis (m04 rail),
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

  if (!selected) return null;

  const file = selected.file;
  const meta = formatPredictTrackMeta(file, channel, t);

  return (
    <>
      <div
        className="predict-filter-track-bar"
        role="group"
        aria-label={t("predict.results.fileNavAria")}
      >
        <div className="analysis-segment-rail-studio-file">
          <span className="analysis-segment-rail-studio-wave" aria-hidden>
            <IconWaveform />
          </span>
          <span
            className="analysis-segment-rail-studio-filename"
            title={file.name}
          >
            {file.name}
          </span>
          <div className="analysis-segment-rail-studio-file-end">
            <div
              className="analysis-segment-rail-studio-filenav"
              role="group"
              aria-label={t("predict.results.fileNavAria")}
            >
              <button
                type="button"
                className="analysis-segment-rail-studio-filenav-btn"
                disabled={!canPrev || disabled}
                aria-label={t("predict.results.filePrev")}
                title={t("predict.results.filePrevHint")}
                onClick={() => goRelative(-1)}
              >
                <IconChevronLeft />
              </button>
              <button
                type="button"
                className="analysis-segment-rail-studio-filenav-btn"
                disabled={!canNext || disabled}
                aria-label={t("predict.results.fileNext")}
                title={t("predict.results.fileNextHint")}
                onClick={() => goRelative(1)}
              >
                <IconChevronRight />
              </button>
            </div>
            <button
              type="button"
              className={`analysis-segment-rail-studio-filemenu${
                pickerOpen ? " is-open" : ""
              }`}
              disabled={disabled}
              aria-label={t("predict.results.filePicker")}
              title={
                pickerOpen
                  ? t("predict.results.filePickerCloseHint")
                  : t("predict.results.filePickerHint")
              }
              aria-expanded={pickerOpen}
              onClick={togglePicker}
            >
              <IconAudioFiles size={18} />
            </button>
            {meta ? (
              <span className="analysis-segment-rail-studio-filemeta-muted">
                {meta}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <PredictResultsFilePickerModal
        open={pickerOpen}
        files={sources.map((s) => s.file)}
        activeFileName={file.name}
        onClose={closePicker}
        onSelect={(name) => {
          const hit = sources.find((s) => s.file.name === name);
          if (hit) onSelectPredictedPath(hit.predictedPath);
        }}
      />
    </>
  );
}
