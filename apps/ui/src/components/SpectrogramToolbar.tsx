import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SpectrogramColormap } from "../lib/spectrogramView";
import {
  IconChevronLeft,
  IconChevronRight,
  IconExport,
  IconFilter,
  IconLanes,
  IconLayers,
  IconPalette,
  IconZoomIn,
  IconZoomOut,
} from "./SpectrogramIcons";
import { SpectrogramMarkOpacityControl } from "./SpectrogramMarkOpacityControl";

export type SpectrogramToolbarProps = {
  compact?: boolean;
  /** Inside unified control deck — no separate card chrome. */
  embedded?: boolean;
  segmentIndex: number;
  segmentTotal: number;
  segmentT0: number;
  segmentT1: number;
  viewZoomed: boolean;
  viewStart: number;
  viewEnd: number;
  duration: number;
  playheadSec: number;
  colormap: SpectrogramColormap;
  confidenceMin: number;
  markOpacity: number;
  hasLabels: boolean;
  overlayOnSpec: boolean;
  showLanes: boolean;
  segmentCount: number;
  exporting: boolean;
  canSegmentPrev: boolean;
  canSegmentNext: boolean;
  canPanPrev: boolean;
  canPanNext: boolean;
  canExport: boolean;
  onSegmentPrev: () => void;
  onSegmentNext: () => void;
  onColormapChange: (map: SpectrogramColormap) => void;
  onConfidenceMinChange: (value: number) => void;
  onMarkOpacityChange: (value: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanPrev: () => void;
  onPanNext: () => void;
  onOverlayToggle: () => void;
  onLanesToggle: () => void;
  onExport: () => void;
  /** Hide inferno/viridis/gray palette toggles (scientific / predict results). */
  hideColormap?: boolean;
  /** Logic Pro–style dark chrome for embedded toolbars. */
  logicPro?: boolean;
};

function ToolbarIconButton({
  label,
  hint,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35 ${
        pressed
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <div
      className="hidden h-7 w-px shrink-0 bg-border sm:block"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

function KindToggle({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={hint}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-surface text-foreground-muted hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

export function SpectrogramToolbar({
  compact,
  embedded = false,
  segmentIndex,
  segmentTotal,
  segmentT0,
  segmentT1,
  viewZoomed,
  viewStart,
  viewEnd,
  duration,
  playheadSec,
  colormap,
  confidenceMin,
  markOpacity,
  hasLabels,
  overlayOnSpec,
  showLanes,
  segmentCount,
  exporting,
  canSegmentPrev,
  canSegmentNext,
  canPanPrev,
  canPanNext,
  canExport,
  onSegmentPrev,
  onSegmentNext,
  onColormapChange,
  onConfidenceMinChange,
  onMarkOpacityChange,
  onZoomIn,
  onZoomOut,
  onPanPrev,
  onPanNext,
  onOverlayToggle,
  onLanesToggle,
  onExport,
  hideColormap = false,
  logicPro = false,
}: SpectrogramToolbarProps) {
  const { t } = useTranslation();

  const toolbarInner = (
      <div
        className={`flex flex-col gap-2 ${
          embedded
            ? logicPro
              ? "analysis-lab-toolbar-logic"
              : "analysis-lab-toolbar-embedded"
            : `rounded-lg border px-2 py-2 sm:px-3 ${
                compact ? "border-border bg-surface" : "analysis-lab-toolbar"
              }`
        }`}
        role="toolbar"
        aria-label={t("spectrogram.toolbar.ariaLabel")}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex items-center gap-1">
            <ToolbarIconButton
              label={t("spectrogram.segment.navPrev")}
              hint={t("spectrogram.segment.navPrev")}
              disabled={!canSegmentPrev}
              onClick={onSegmentPrev}
            >
              <IconChevronLeft />
            </ToolbarIconButton>
            <div
              className="min-w-[7.5rem] px-1 text-center font-mono text-[11px] leading-tight text-foreground"
              title={t("spectrogram.segment.rangeSec", {
                t0: segmentT0,
                t1: segmentT1,
              })}
            >
              <div className="font-medium text-foreground">
                {t("spectrogram.segment.counter", {
                  index: segmentIndex + 1,
                  total: segmentTotal,
                })}
              </div>
              <div className="text-foreground-muted">
                {t("spectrogram.segment.rangeSec", { t0: segmentT0, t1: segmentT1 })}
              </div>
              {viewZoomed ? (
                <div className="text-[10px] text-foreground-muted">
                  {t("spectrogram.toolbar.windowSec", {
                    t0: viewStart.toFixed(1),
                    t1: viewEnd.toFixed(1),
                  })}
                </div>
              ) : null}
            </div>
            <ToolbarIconButton
              label={t("spectrogram.segment.navNext")}
              hint={t("spectrogram.segment.navNext")}
              disabled={!canSegmentNext}
              onClick={onSegmentNext}
            >
              <IconChevronRight />
            </ToolbarIconButton>
          </div>

          <ToolbarDivider />

          <div
            className="flex min-w-[9rem] flex-1 items-center gap-2 sm:min-w-[11rem] sm:max-w-[14rem]"
            title={t("spectrogram.toolbar.confidenceHint")}
          >
            <span className="text-foreground-muted" title={t("spectrogram.toolbar.confidenceHint")}>
              <IconFilter />
            </span>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="sr-only">{t("spectrogram.toolbar.confidenceLabel")}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(confidenceMin * 100)}
                onChange={(e) =>
                  onConfidenceMinChange(Number(e.target.value) / 100)
                }
                className="min-w-0 flex-1 accent-accent"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(confidenceMin * 100)}
                aria-label={t("spectrogram.toolbar.confidenceLabel")}
              />
              <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
                {confidenceMin.toFixed(2)}
              </span>
            </label>
          </div>

          {hasLabels ? (
            <>
              <ToolbarDivider />
              <SpectrogramMarkOpacityControl
                value={markOpacity}
                onChange={onMarkOpacityChange}
              />
            </>
          ) : null}

          {!compact && !hideColormap ? (
            <>
              <ToolbarDivider />
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label={t("spectrogram.toolbar.colormapLabel")}
              >
                <span className="mr-0.5 hidden text-foreground-muted lg:inline-flex">
                  <IconPalette />
                </span>
                <KindToggle
                  active={colormap === "inferno"}
                  label={t("spectrogram.toolbar.colormapInferno")}
                  hint={t("spectrogram.toolbar.colormapInfernoHint")}
                  onClick={() => onColormapChange("inferno")}
                >
                  <span className="swatch-inferno" aria-hidden />
                </KindToggle>
                <KindToggle
                  active={colormap === "viridis"}
                  label={t("spectrogram.toolbar.colormapViridis")}
                  hint={t("spectrogram.toolbar.colormapViridisHint")}
                  onClick={() => onColormapChange("viridis")}
                >
                  <span className="swatch-viridis" aria-hidden />
                </KindToggle>
                <KindToggle
                  active={colormap === "gray"}
                  label={t("spectrogram.toolbar.colormapGray")}
                  hint={t("spectrogram.toolbar.colormapGrayHint")}
                  onClick={() => onColormapChange("gray")}
                >
                  <span className="swatch-gray" aria-hidden />
                </KindToggle>
              </div>
            </>
          ) : null}

          <ToolbarDivider />

          <div className="flex items-center gap-1" role="group" aria-label={t("spectrogram.toolbar.viewLabel")}>
            <ToolbarIconButton
              label={t("spectrogram.zoomIn")}
              hint={t("spectrogram.toolbar.zoomInHint")}
              onClick={onZoomIn}
            >
              <IconZoomIn />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t("spectrogram.zoomOut")}
              hint={t("spectrogram.toolbar.zoomOutHint")}
              onClick={onZoomOut}
            >
              <IconZoomOut />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t("spectrogram.toolbar.panPrev")}
              hint={t("spectrogram.toolbar.panPrevHint")}
              disabled={!canPanPrev}
              onClick={onPanPrev}
            >
              <IconChevronLeft />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t("spectrogram.toolbar.panNext")}
              hint={t("spectrogram.toolbar.panNextHint")}
              disabled={!canPanNext}
              onClick={onPanNext}
            >
              <IconChevronRight />
            </ToolbarIconButton>
          </div>

          {hasLabels ? (
            <>
              <ToolbarDivider />
              <div className="flex items-center gap-1" role="group" aria-label={t("spectrogram.layers")}>
                <ToolbarIconButton
                  label={t("spectrogram.overlayOnSpec")}
                  hint={t("spectrogram.overlayHint")}
                  pressed={overlayOnSpec}
                  onClick={onOverlayToggle}
                >
                  <IconLayers />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label={t("spectrogram.lanesToggle")}
                  hint={t("spectrogram.toolbar.lanesHint")}
                  pressed={showLanes}
                  onClick={onLanesToggle}
                >
                  <IconLanes />
                </ToolbarIconButton>
              </div>
            </>
          ) : null}

          <div className="flex flex-1 justify-end">
            <button
              type="button"
              disabled={!canExport || exporting}
              onClick={onExport}
              title={t("spectrogram.toolbar.exportHint")}
              aria-label={t("spectrogram.exportAudacity")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-subtle px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              <IconExport />
              <span className="hidden sm:inline">
                {exporting ? t("common.loading") : t("spectrogram.exportAudacity")}
              </span>
            </button>
          </div>
        </div>

        <p className="font-mono text-[10px] leading-snug text-foreground-muted">
          {t("spectrogram.toolbar.statusLine", {
            viewStart: viewStart.toFixed(1),
            viewEnd: viewEnd.toFixed(1),
            duration: duration.toFixed(1),
            playhead: playheadSec.toFixed(2),
          })}
          {hasLabels
            ? ` · ${t("spectrogram.segments", { count: segmentCount })}`
            : null}
          {!compact && !hideColormap ? ` · ${colormap}` : null}
        </p>
      </div>
  );

  if (embedded) {
    return toolbarInner;
  }

  return <div className="flex flex-col gap-2">{toolbarInner}</div>;
}
