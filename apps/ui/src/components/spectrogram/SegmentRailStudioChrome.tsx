import type { RefObject } from "react";
import type { TFunction } from "i18next";
import { formatSpectrogramAxisTime } from "../../lib/spectrogramTimeTicks";
import {
  SPECTROGRAM_COLORMAP_LABEL,
  SPECTROGRAM_COLORMAPS,
  type SpectrogramColormap,
} from "../../lib/spectrogramView";
import type { AnalysisLabelKind } from "../../lib/predictQueueUi";
import {
  IconSegmentDown,
  IconSegmentNext,
  IconSegmentPrev,
  IconClassesColored,
  IconPlayerReturn,
  IconWaveform,
} from "../SpectrogramIcons";

export type SegmentRailStudioChromeProps = {
  t: TFunction;
  durationSec: number;
  viewStart: number;
  viewSpan: number;
  segmentIndex: number;
  segmentTotal: number;
  canPrev: boolean;
  canNext: boolean;
  fileName?: string | null;
  fileMeta?: string | null;
  onFileMenuToggle?: (() => void) | null;
  onFileMenuClose?: (() => void) | null;
  fileMenuOpen?: boolean;
  fileMenuDisabled?: boolean;
  fileMenuFiles?: readonly { name: string }[] | null;
  fileMenuActiveName?: string | null;
  onFileMenuSelect?: ((name: string) => void) | null;
  onFilePrev?: (() => void) | null;
  onFileNext?: (() => void) | null;
  canFilePrev?: boolean;
  canFileNext?: boolean;
  fileNavOnly?: boolean;
  onClassesFilterToggle?: (() => void) | null;
  classesFilterOpen?: boolean;
  labelSource?: {
    kind: AnalysisLabelKind;
    originalAvailable: boolean;
    filteredAvailable: boolean;
    fileName: string;
    onChange: (kind: AnalysisLabelKind) => void;
  } | null;
  colormap?: SpectrogramColormap;
  onColormapChange?: ((map: SpectrogramColormap) => void) | null;
  cmapOpen: boolean;
  setCmapOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  cmapRef: RefObject<HTMLDivElement | null>;
  fileMenuRef: RefObject<HTMLDivElement | null>;
  onSegmentSelect: (index: number) => void;
};

/** Studio (m04) file / segment chrome — extracted from SpectrogramFileSegmentRail. */
export function SegmentRailStudioChrome({
  t,
  durationSec,
  viewStart,
  viewSpan,
  segmentIndex,
  segmentTotal,
  canPrev,
  canNext,
  fileName = null,
  fileMeta = null,
  onFileMenuToggle = null,
  onFileMenuClose = null,
  fileMenuOpen = false,
  fileMenuDisabled = false,
  fileMenuFiles = null,
  fileMenuActiveName = null,
  onFileMenuSelect = null,
  onFilePrev = null,
  onFileNext = null,
  canFilePrev = false,
  canFileNext = false,
  fileNavOnly = false,
  onClassesFilterToggle = null,
  classesFilterOpen = false,
  labelSource = null,
  colormap = "gray",
  onColormapChange = null,
  cmapOpen,
  setCmapOpen,
  cmapRef,
  fileMenuRef,
  onSegmentSelect,
}: SegmentRailStudioChromeProps) {
  // File-nav-only chrome (Analysis table-hero / Filter track) does not need
  // a loaded WAV duration — segment controls are hidden.
  if (durationSec <= 0 && !fileNavOnly) return null;

  const t0Label = formatSpectrogramAxisTime(viewStart);
  const t1Label = formatSpectrogramAxisTime(
    Math.min(durationSec, viewStart + viewSpan),
  );
  const segmentRangeLabel = `${t0Label} — ${t1Label}`;
  const segmentDurationLabel = t("spectrogram.segment.fileDuration", {
    sec: Math.max(1, Math.round(viewSpan)),
  });

  return (
    <div
      className={`analysis-segment-rail-studio${
        fileNavOnly ? " is-file-nav-only" : ""
      }`}
      role="group"
      aria-label={t("spectrogram.segment.studioSliderAria")}
      data-spectrogram-chrome=""
      data-file-nav-only={fileNavOnly ? "" : undefined}
    >
      <div className="analysis-segment-rail-studio-head">
        <div className="analysis-segment-rail-studio-file">
          {fileName || onFileMenuToggle || onFilePrev || onFileNext ? (
            <div
              className="analysis-segment-rail-studio-fileframe-wrap"
              ref={fileMenuRef}
            >
              <div
                className="analysis-segment-rail-studio-fileframe"
                role="group"
                aria-label={t("predict.results.fileNavAria")}
              >
                {onFilePrev || onFileNext ? (
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-fileframe-nav"
                    disabled={!canFilePrev || fileMenuDisabled}
                    aria-label={t("predict.results.filePrev")}
                    title={t("predict.results.filePrevHint")}
                    onClick={() => onFilePrev?.()}
                  >
                    <IconSegmentPrev />
                  </button>
                ) : null}
                {onFileMenuToggle ? (
                  <button
                    type="button"
                    className={`analysis-segment-rail-studio-fileframe-main${
                      fileMenuOpen ? " is-open" : ""
                    }`}
                    disabled={fileMenuDisabled}
                    aria-label={t("predict.results.filePicker")}
                    aria-haspopup="listbox"
                    title={
                      fileMenuOpen
                        ? t("predict.results.filePickerCloseHint")
                        : t("predict.results.filePickerHint")
                    }
                    aria-expanded={fileMenuOpen}
                    onClick={onFileMenuToggle}
                  >
                    <span
                      className="analysis-segment-rail-studio-wave"
                      aria-hidden
                    >
                      <IconWaveform />
                    </span>
                    {fileName ? (
                      <span
                        className="analysis-segment-rail-studio-filename"
                        title={fileName}
                      >
                        {fileName}
                      </span>
                    ) : null}
                    <span
                      className="analysis-segment-rail-studio-fileframe-caret"
                      aria-hidden
                    >
                      <IconSegmentDown />
                    </span>
                  </button>
                ) : (
                  <span className="analysis-segment-rail-studio-fileframe-main is-static">
                    <span
                      className="analysis-segment-rail-studio-wave"
                      aria-hidden
                    >
                      <IconWaveform />
                    </span>
                    {fileName ? (
                      <span
                        className="analysis-segment-rail-studio-filename"
                        title={fileName}
                      >
                        {fileName}
                      </span>
                    ) : null}
                  </span>
                )}
                {onFilePrev || onFileNext ? (
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-fileframe-nav"
                    disabled={!canFileNext || fileMenuDisabled}
                    aria-label={t("predict.results.fileNext")}
                    title={t("predict.results.fileNextHint")}
                    onClick={() => onFileNext?.()}
                  >
                    <IconSegmentNext />
                  </button>
                ) : null}
              </div>
              {fileMenuOpen && onFileMenuToggle ? (
                <ul
                  className="analysis-segment-rail-studio-filemenu-list"
                  role="listbox"
                  aria-label={t("predict.results.filePickerTitle")}
                >
                  {(fileMenuFiles ?? []).length === 0 ? (
                    <li className="analysis-segment-rail-studio-filemenu-empty">
                      {t("predict.results.noFiles")}
                    </li>
                  ) : (
                    (fileMenuFiles ?? []).map((file) => {
                      const selected = file.name === fileMenuActiveName;
                      return (
                        <li key={file.name}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`analysis-segment-rail-studio-filemenu-item${
                              selected ? " is-selected" : ""
                            }`}
                            title={file.name}
                            onClick={() => {
                              onFileMenuSelect?.(file.name);
                              onFileMenuClose?.();
                            }}
                          >
                            {file.name}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="analysis-segment-rail-studio-file-end">
            {fileMeta ? (
              <span className="analysis-segment-rail-studio-filemeta-muted">
                {fileMeta}
              </span>
            ) : null}
            {labelSource ? (
              <div
                className="analysis-segment-rail-studio-labels"
                role="group"
                aria-label={t("predict.results.labelSourceAria")}
              >
                <button
                  type="button"
                  className="analysis-segment-rail-studio-label-btn"
                  aria-pressed={labelSource.kind === "original"}
                  disabled={!labelSource.originalAvailable}
                  title={t("predict.results.labelSourceOriginalHint")}
                  onClick={() => labelSource.onChange("original")}
                >
                  {t("predict.results.labelSourceOriginal")}
                </button>
                <button
                  type="button"
                  className="analysis-segment-rail-studio-label-btn"
                  aria-pressed={labelSource.kind === "filtered"}
                  disabled={!labelSource.filteredAvailable}
                  title={
                    labelSource.fileName && labelSource.kind === "filtered"
                      ? labelSource.fileName
                      : t("predict.results.labelSourceFilteredHint")
                  }
                  onClick={() => labelSource.onChange("filtered")}
                >
                  {t("predict.results.labelSourceFiltered")}
                </button>
              </div>
            ) : null}
            {fileNavOnly && onClassesFilterToggle ? (
              <button
                type="button"
                className={`analysis-segment-rail-studio-classes${
                  classesFilterOpen ? " is-open" : ""
                }`}
                aria-label={t("predict.results.classesFilter")}
                title={
                  classesFilterOpen
                    ? t("predict.results.classesFilterCloseHint")
                    : t("predict.results.classesFilterHint")
                }
                aria-expanded={classesFilterOpen}
                onClick={onClassesFilterToggle}
              >
                <IconClassesColored />
              </button>
            ) : null}
          </div>
        </div>

        {!fileNavOnly ? (
          <>
            <div className="analysis-segment-rail-studio-sep" aria-hidden />

            <div className="analysis-segment-rail-studio-right">
              {onColormapChange ? (
                <div
                  className="analysis-segment-rail-studio-cmap"
                  ref={cmapRef}
                >
                  <button
                    type="button"
                    className={`analysis-segment-rail-studio-cmap-btn${
                      cmapOpen ? " is-open" : ""
                    }`}
                    aria-label={t("spectrogram.toolbar.colormapLabel")}
                    aria-haspopup="listbox"
                    aria-expanded={cmapOpen}
                    onClick={() => setCmapOpen((open) => !open)}
                  >
                    <span
                      className={`analysis-segment-rail-studio-cmap-swatch is-${colormap}`}
                      aria-hidden
                    />
                    <span className="analysis-segment-rail-studio-cmap-name">
                      {SPECTROGRAM_COLORMAP_LABEL[colormap]}
                    </span>
                    <span
                      className="analysis-segment-rail-studio-cmap-caret"
                      aria-hidden
                    />
                  </button>
                  {cmapOpen ? (
                    <ul
                      className="analysis-segment-rail-studio-cmap-menu"
                      role="listbox"
                      aria-label={t("spectrogram.toolbar.colormapLabel")}
                    >
                      {SPECTROGRAM_COLORMAPS.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={name === colormap}
                            className={`analysis-segment-rail-studio-cmap-item${
                              name === colormap ? " is-selected" : ""
                            }`}
                            onClick={() => {
                              onColormapChange(name);
                              setCmapOpen(false);
                            }}
                          >
                            <span
                              className={`analysis-segment-rail-studio-cmap-swatch is-${name}`}
                              aria-hidden
                            />
                            {SPECTROGRAM_COLORMAP_LABEL[name]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {onClassesFilterToggle ? (
                <div
                  className="analysis-segment-rail-studio-mode"
                  role="group"
                  aria-label={t("predict.results.studioToolsAria")}
                >
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-mode-btn"
                    aria-label={t("predict.results.classesFilter")}
                    title={t("predict.results.classesToolsHint")}
                    aria-pressed={classesFilterOpen}
                    onClick={() => {
                      if (!classesFilterOpen) onClassesFilterToggle();
                    }}
                  >
                    <IconClassesColored size={18} />
                    <span>{t("predict.results.classesFilter")}</span>
                  </button>
                  <button
                    type="button"
                    className="analysis-segment-rail-studio-mode-btn"
                    aria-label={t("predict.results.playerTools")}
                    title={t("predict.results.playerToolsHint")}
                    aria-pressed={!classesFilterOpen}
                    onClick={() => {
                      if (classesFilterOpen) onClassesFilterToggle();
                    }}
                  >
                    <IconPlayerReturn size={18} />
                    <span>{t("predict.results.playerTools")}</span>
                  </button>
                </div>
              ) : null}
              <div className="analysis-segment-rail-studio-meta">
                <span className="analysis-segment-rail-studio-title">
                  {t("spectrogram.segment.counter", {
                    index: segmentIndex + 1,
                    total: segmentTotal,
                  })}
                </span>
                <span className="analysis-segment-rail-studio-range">
                  {segmentRangeLabel}
                </span>
                <span className="analysis-segment-rail-studio-duration">
                  · {segmentDurationLabel}
                </span>
              </div>

              <div className="analysis-segment-rail-studio-nav">
                <button
                  type="button"
                  className="analysis-segment-rail-studio-nav-btn"
                  disabled={!canPrev}
                  aria-label={t("spectrogram.segment.navPrev")}
                  title={t("spectrogram.segment.navPrev")}
                  onClick={() => onSegmentSelect(segmentIndex - 1)}
                >
                  <IconSegmentPrev />
                </button>
                <button
                  type="button"
                  className="analysis-segment-rail-studio-nav-btn"
                  disabled={!canNext}
                  aria-label={t("spectrogram.segment.navNext")}
                  title={t("spectrogram.segment.navNext")}
                  onClick={() => onSegmentSelect(segmentIndex + 1)}
                >
                  <IconSegmentNext />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
