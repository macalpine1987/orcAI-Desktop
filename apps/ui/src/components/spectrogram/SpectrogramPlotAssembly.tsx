import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { SpectrogramMeta } from "../../api/spectrogram";
import { displaySpectrogramSampleRateHz } from "../../lib/formatAudio";
import { SPECTROGRAM_FREQUENCY_AXIS_M04_STEP_KHZ } from "../../lib/spectrogramAxisTicks";
import type { DetectionSelection } from "../../lib/spectrogramDetections";
import type { LabelTimeUnit } from "../../api/labels";
import type { TimeRangeSec } from "../../lib/spectrogramTimeRange";
import { basename } from "../../platform/dialog";
import type { LabelColorMap } from "../../lib/labelColors";
import type { SpectrogramColormap } from "../../lib/spectrogramView";
import { SpectrogramAxisCorner } from "../SpectrogramAxisCorner";
import { SpectrogramColormapCanvas } from "../SpectrogramColormapCanvas";
import { SpectrogramFrequencyAxis } from "../SpectrogramFrequencyAxis";
import {
  SpectrogramOverlay,
  type OverlaySegment,
} from "../SpectrogramOverlay";
import { SpectrogramSpecHeaderBar } from "../SpectrogramSpecHeaderBar";
import { SpectrogramTimeAxis } from "../SpectrogramTimeAxis";
import { SpectrogramTimeRangeOverlay } from "../SpectrogramTimeRangeOverlay";

export type SpectrogramPlotAssemblyProps = {
  studioChrome: boolean;
  isScientific: boolean;
  lightGrayCanvas: boolean;
  segmentPortaled: boolean;
  wavPath: string;
  meta: SpectrogramMeta;
  channel: number;
  duration: number;
  axisMaxHz: number;
  specHeight: number;
  plotCanvasRef: RefObject<HTMLDivElement | null>;
  seekAreaRef: RefObject<HTMLDivElement | null>;
  handPanArmed: boolean;
  canScrollTime: boolean;
  onSeekPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  updateHoverFromClient: (clientX: number, clientY: number) => void;
  setHoverCoords: (v: null) => void;
  seekToTime: (sec: number) => void;
  viewStart: number;
  viewSpan: number;
  viewEnd: number;
  visibleSpan: number;
  tileMediaStyle: CSSProperties;
  grayTileSrc: string;
  colormap: SpectrogramColormap;
  tileReloadToken: string;
  plotWidth: number;
  onTileLoading: () => void;
  onTileLoaded: () => void;
  onTileFailed: () => void;
  showTileLoadingOverlay: boolean;
  overlayOnSpec: boolean;
  hasLabels: boolean;
  overlaySegments: OverlaySegment[];
  labelNames: string[];
  labelDeltaT: number;
  labelTimeUnit: LabelTimeUnit | undefined;
  labelColorMap: LabelColorMap;
  hiddenLabels: Set<string>;
  soloLabel: string | null;
  selectedSegment: DetectionSelection | null;
  markOpacity: number;
  showProbabilityLabels: boolean;
  onSegmentClick: (seg: OverlaySegment) => void;
  loopRegion: TimeRangeSec | null;
  timeSelectionDraft: TimeRangeSec | null;
  timeSelection: TimeRangeSec | null;
  playheadFrac: number | null;
};

export function SpectrogramPlotAssembly(props: SpectrogramPlotAssemblyProps) {
  const { t } = useTranslation();
  const {
    studioChrome,
    isScientific,
    lightGrayCanvas,
    segmentPortaled,
    wavPath,
    meta,
    channel,
    duration,
    axisMaxHz,
    specHeight,
    plotCanvasRef,
    seekAreaRef,
    handPanArmed,
    canScrollTime,
    onSeekPointerDown,
    onSeekPointerMove,
    onSeekPointerUp,
    onSeekClick,
    updateHoverFromClient,
    setHoverCoords,
    seekToTime,
    viewStart,
    viewSpan,
    viewEnd,
    visibleSpan,
    tileMediaStyle,
    grayTileSrc,
    colormap,
    tileReloadToken,
    plotWidth,
    onTileLoading,
    onTileLoaded,
    onTileFailed,
    showTileLoadingOverlay,
    overlayOnSpec,
    hasLabels,
    overlaySegments,
    labelNames,
    labelDeltaT,
    labelTimeUnit,
    labelColorMap,
    hiddenLabels,
    soloLabel,
    selectedSegment,
    markOpacity,
    showProbabilityLabels,
    onSegmentClick,
    loopRegion,
    timeSelectionDraft,
    timeSelection,
    playheadFrac,
  } = props;

  return (
    <div
        className={
          studioChrome
            ? "analysis-spectrogram-studio-with-sidebar is-single-plot"
            : undefined
        }
      >
      <div
        className={`analysis-spectrogram-plot-assembly${isScientific ? " analysis-spectrogram-scientific" : ""}${studioChrome ? " analysis-spectrogram-studio" : ""}${isScientific && !lightGrayCanvas ? " is-cmap-dark" : ""}`}
      >
        {studioChrome && !segmentPortaled ? (
          <SpectrogramSpecHeaderBar
            fileName={basename(wavPath)}
            sampleRateHz={displaySpectrogramSampleRateHz(meta)}
            channel={channel}
            durationSec={duration}
          />
        ) : null}
        <div className="analysis-spectrogram-plot-frame">
        <div className="analysis-spectrogram-plot-row">
          <SpectrogramFrequencyAxis
            axisMaxHz={axisMaxHz}
            height={specHeight}
            fillContainer={studioChrome}
            unitInCorner={isScientific}
            compactEdgeLabels={isScientific}
            autoTick={false}
            labelStepKhz={
              isScientific ? SPECTROGRAM_FREQUENCY_AXIS_M04_STEP_KHZ : undefined
            }
          />
          <div
            ref={plotCanvasRef}
            className="analysis-spectrogram-canvas relative min-h-0 min-w-0"
          >
            <div className="analysis-spectrogram-stage">
              <div className="analysis-spectrogram-media">
                <div
                  ref={seekAreaRef}
                  role="button"
                  tabIndex={0}
                  data-spectrogram-plot=""
                  className={`relative w-full ${
                    handPanArmed
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-crosshair"
                  } ${canScrollTime ? "touch-pan-x" : ""}`}
                  style={
                    studioChrome
                      ? { height: "100%", minHeight: 160 }
                      : { height: specHeight }
                  }
                  title={
                    handPanArmed
                      ? t("spectrogram.toolbar.handPanArmedHint")
                      : canScrollTime
                        ? `${t("spectrogram.dragLoopHint")} · ${t("spectrogram.clickToSeek")} · ${t("spectrogram.scrollHint")}`
                        : `${t("spectrogram.dragLoopHint")} · ${t("spectrogram.clickToSeek")}`
                  }
                  onPointerDown={onSeekPointerDown}
                  onPointerMove={onSeekPointerMove}
                  onPointerUp={onSeekPointerUp}
                  onPointerCancel={onSeekPointerUp}
                  onClick={onSeekClick}
                  onMouseMove={(e) => updateHoverFromClient(e.clientX, e.clientY)}
                  onMouseLeave={() => setHoverCoords(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      seekToTime(viewStart + viewSpan / 2);
                    }
                  }}
                >
                  <div
                    className={`relative h-full w-full${
                      isScientific ? " overflow-visible" : " overflow-hidden"
                    }`}
                  >
                    <div className="relative h-full" style={tileMediaStyle}>
                      <SpectrogramColormapCanvas
                        grayTileUrl={grayTileSrc}
                        colormap={colormap}
                        invert={false}
                        reloadToken={tileReloadToken}
                        fileKey={wavPath}
                        width={plotWidth}
                        height={specHeight}
                        fillContainer={studioChrome}
                        alt={
                          grayTileSrc
                            ? t("spectrogram.liveTitle")
                            : t("spectrogram.placeholderTitle")
                        }
                        className={`pointer-events-none block w-full select-none ${lightGrayCanvas ? "bg-[#ececec]" : "bg-black"}`}
                        onLoading={onTileLoading}
                        onLoaded={onTileLoaded}
                        onFailed={onTileFailed}
                      />
                      {showTileLoadingOverlay ? (
                        <div
                          className={`pointer-events-none absolute inset-0 flex items-center justify-center text-xs ${lightGrayCanvas ? "bg-[#ececec]/80 text-foreground-muted" : "bg-black/60 text-foreground-muted"}`}
                          aria-live="polite"
                        >
                          {t("common.loading")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {overlayOnSpec && hasLabels && (
                    <SpectrogramOverlay
                      segments={overlaySegments}
                      labelNames={labelNames}
                      viewStart={viewStart}
                      viewSpan={visibleSpan}
                      durationSec={duration}
                      deltaT={labelDeltaT}
                      timeUnit={labelTimeUnit}
                      colorMap={labelColorMap}
                      hiddenLabels={hiddenLabels}
                      soloLabel={soloLabel}
                      selectedSegment={selectedSegment}
                      markOpacity={markOpacity}
                      showProbabilityLabels={showProbabilityLabels}
                      nyquistHz={axisMaxHz}
                      layoutSize={{ w: plotWidth, h: specHeight }}
                      onSegmentClick={onSegmentClick}
                    />
                  )}
                  {loopRegion && !timeSelectionDraft ? (
                    <SpectrogramTimeRangeOverlay
                      range={loopRegion}
                      viewStart={viewStart}
                      viewSpan={visibleSpan}
                      variant="loop"
                    />
                  ) : null}
                  {timeSelectionDraft || (!loopRegion && timeSelection) ? (
                    <SpectrogramTimeRangeOverlay
                      range={timeSelectionDraft ?? timeSelection!}
                      viewStart={viewStart}
                      viewSpan={visibleSpan}
                      variant="draft"
                    />
                  ) : null}
                  {playheadFrac != null && (
                    <div
                      className="analysis-playhead"
                      style={{ left: `${playheadFrac * 100}%` }}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="analysis-spectrogram-plot-footer flex min-w-0 gap-0">
          <SpectrogramAxisCorner
            frequencyUnit={
              isScientific ? t("spectrogram.frequencyAxis.unit") : undefined
            }
          />
          <SpectrogramTimeAxis
            viewStart={viewStart}
            viewEnd={viewEnd}
            plotWidthPx={plotWidth}
            autoTick={isScientific}
          />
        </div>
        </div>
      </div>
      {/* Right class rail removed — Classes button opens tools strip / modal. */}
      </div>
  );
}
