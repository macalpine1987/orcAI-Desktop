import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { LabelTimeUnit } from "../../api/labels";
import type { DetectionSelection } from "../../lib/spectrogramDetections";
import type { TimeRangeSec } from "../../lib/spectrogramTimeRange";
import type { LabelColorMap } from "../../lib/labelColors";
import type { SpectrogramColormap } from "../../lib/spectrogramView";
import { SpectrogramColormapCanvas } from "../SpectrogramColormapCanvas";
import {
  SpectrogramOverlay,
  type OverlaySegment,
} from "../SpectrogramOverlay";
import { SpectrogramTimeNavigator } from "../SpectrogramTimeNavigator";
import { SpectrogramTimeRangeOverlay } from "../SpectrogramTimeRangeOverlay";

export type SpectrogramSimplePlotProps = {
  studioChrome: boolean;
  isScientific: boolean;
  seekAreaRef: RefObject<HTMLDivElement | null>;
  handPanArmed: boolean;
  canScrollTime: boolean;
  specHeight: number;
  onSeekPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSeekClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
  updateHoverFromClient: (clientX: number, clientY: number) => void;
  setHoverCoords: (v: null) => void;
  seekToTime: (sec: number) => void;
  viewStart: number;
  viewSpan: number;
  visibleSpan: number;
  duration: number;
  tileMediaStyle: CSSProperties;
  grayTileSrc: string;
  colormap: SpectrogramColormap;
  tileReloadToken: string;
  wavPath: string;
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
  axisMaxHz: number;
  onSegmentClick: (seg: OverlaySegment) => void;
  loopRegion: TimeRangeSec | null;
  timeSelectionDraft: TimeRangeSec | null;
  timeSelection: TimeRangeSec | null;
  playheadFrac: number | null;
  setViewStartClamped: (start: number) => void;
};

export function SpectrogramSimplePlot(props: SpectrogramSimplePlotProps) {
  const { t } = useTranslation();
  const {
    studioChrome,
    isScientific,
    seekAreaRef,
    handPanArmed,
    canScrollTime,
    specHeight,
    onSeekPointerDown,
    onSeekPointerMove,
    onSeekPointerUp,
    onSeekClick,
    updateHoverFromClient,
    setHoverCoords,
    seekToTime,
    viewStart,
    viewSpan,
    visibleSpan,
    duration,
    tileMediaStyle,
    grayTileSrc,
    colormap,
    tileReloadToken,
    wavPath,
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
    axisMaxHz,
    onSegmentClick,
    loopRegion,
    timeSelectionDraft,
    timeSelection,
    playheadFrac,
    setViewStartClamped,
  } = props;

  return (
    <div className="flex min-w-0 flex-1 gap-2">
    <div className="relative min-w-0 flex-1 overflow-hidden rounded border border-border bg-black">
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
              className="pointer-events-none block w-full select-none bg-black"
              onLoading={onTileLoading}
              onLoaded={onTileLoaded}
              onFailed={onTileFailed}
            />
            {showTileLoadingOverlay ? (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-foreground-muted"
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
      <SpectrogramTimeNavigator
        durationSec={duration}
        viewStart={viewStart}
        viewSpan={viewSpan}
        onViewStartChange={setViewStartClamped}
      />
    </div>
                </div>
  );
}
