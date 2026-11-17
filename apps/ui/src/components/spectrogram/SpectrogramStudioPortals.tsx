import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import {
  confidenceFractionToFloorPercent,
  floorPercentToConfidenceFraction,
} from "../../lib/spectrogramProbFloor";
import type { LabelColorMap } from "../../lib/labelColors";
import {
  PredictResultsClassesToolsPanel,
} from "../PredictResultsClassesToolsPanel";
import type { ClassSidebarEntry } from "../PredictResultsClassSidebar";

type Props = {
  studioChrome: boolean;
  showSpectrogram: boolean;
  toolsPortaled: boolean;
  toolsSlot: HTMLElement | null;
  studioToolsBar: ReactNode;
  classesToolsOpen: boolean;
  classesToolsSlot: HTMLElement | null;
  classSidebarEntries: ClassSidebarEntry[];
  modelClasses: readonly string[] | null;
  hiddenLabels: Set<string>;
  labelColorMap: LabelColorMap;
  confidenceMin: number;
  setConfidenceMin: (v: number) => void;
  showProbabilityLabels: boolean;
  setShowProbabilityLabels: (v: boolean) => void;
  overlayOnSpec: boolean;
  setOverlayOnSpec: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasLabels: boolean;
  toggleClassVisibility: (name: string) => void;
  setHiddenLabels: (v: Set<string>) => void;
  segmentPortaled: boolean;
  studioSegmentRail: ReactNode;
  segmentSlot: HTMLElement | null;
};

/** Studio createPortal wiring for tools / classes strip / segment rail. */
export function SpectrogramStudioPortals({
  studioChrome,
  showSpectrogram,
  toolsPortaled,
  toolsSlot,
  studioToolsBar,
  classesToolsOpen,
  classesToolsSlot,
  classSidebarEntries,
  modelClasses,
  hiddenLabels,
  labelColorMap,
  confidenceMin,
  setConfidenceMin,
  showProbabilityLabels,
  setShowProbabilityLabels,
  overlayOnSpec,
  setOverlayOnSpec,
  hasLabels,
  toggleClassVisibility,
  setHiddenLabels,
  segmentPortaled,
  studioSegmentRail,
  segmentSlot,
}: Props) {
  return (
    <>
      {toolsPortaled && studioToolsBar
        ? createPortal(studioToolsBar, toolsSlot!)
        : studioChrome && !toolsPortaled && studioToolsBar
          ? (
            <div className="predict-results-studio-tools-fallback px-2 py-1">
              {studioToolsBar}
            </div>
          )
          : null}
      {studioChrome &&
      showSpectrogram &&
      classesToolsOpen &&
      classesToolsSlot
        ? createPortal(
            <PredictResultsClassesToolsPanel
              entries={classSidebarEntries}
              modelClasses={modelClasses}
              hidden={hiddenLabels}
              colorMap={labelColorMap}
              probabilityFloor={confidenceFractionToFloorPercent(confidenceMin)}
              onProbabilityFloorChange={(pct) =>
                setConfidenceMin(floorPercentToConfidenceFraction(pct))
              }
              showProbability={showProbabilityLabels}
              showAnnotations={overlayOnSpec}
              annotationsAvailable={hasLabels}
              onToggle={toggleClassVisibility}
              onShowProbabilityChange={setShowProbabilityLabels}
              onShowAnnotationsChange={setOverlayOnSpec}
              onResetAll={() => {
                setHiddenLabels(new Set());
                setConfidenceMin(0);
                setShowProbabilityLabels(true);
                if (hasLabels) setOverlayOnSpec(true);
              }}
            />,
            classesToolsSlot,
          )
        : null}
      {segmentPortaled && studioSegmentRail
        ? createPortal(studioSegmentRail, segmentSlot!)
        : null}
    </>
  );
}
