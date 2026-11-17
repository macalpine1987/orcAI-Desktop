import { SpectrogramCoordinatesBar } from "../SpectrogramCoordinatesBar";
import { SpectrogramFileSegmentRail } from "../SpectrogramFileSegmentRail";
import { SpectrogramLabControlDeck } from "../SpectrogramLabControlDeck";
import { SpectrogramStudioPortals } from "./SpectrogramStudioPortals";
import { SpectrogramStudioSegmentRail } from "./SpectrogramStudioSegmentRail";
import { SpectrogramChromePlaybackPanel } from "./SpectrogramChromePlaybackPanel";
import { SpectrogramChromeToolsPanel } from "./SpectrogramChromeToolsPanel";
import type { SpectrogramViewerChromeProps } from "./spectrogramViewerChromeProps";

export function SpectrogramViewerChrome({
  meta,
  wavPath,
  channel,
  duration,
  studioChrome,
  showSpectrogram,
  isScientific,
  isProPlot,
  slots,
  playback,
  tools,
  status,
  classes,
  nodes,
}: SpectrogramViewerChromeProps) {
  const {
    transportSlot,
    toolsSlot,
    lcdSlot,
    zoomSlot,
    segmentSlot,
    classesToolsSlot,
    classesToolsOpen,
    onClassesToolsOpenChange,
  } = slots;
  const {
    viewStart,
    viewSpan,
    viewEnd,
    playheadSec,
    markOpacity,
    setMarkOpacity,
    hasLabelPaths,
  } = playback;
  const {
    segmentNav,
    setColormap,
    confidenceMin,
    setConfidenceMin,
    overlayOnSpec,
    setOverlayOnSpec,
    applySegment,
    setViewStartClamped,
    classesFilterOpen,
    setClassesFilterOpen,
    hoverCoords,
    cursorFrequency,
    colormap,
  } = tools;
  const {
    tileError,
    segmentHint,
    labelsError,
    tfBoundsNotice,
    exportMsg,
  } = status;
  const {
    classSidebarEntries,
    hiddenLabels,
    labelColorMap,
    showProbabilityLabels,
    setShowProbabilityLabels,
    hasLabels,
    toggleClassVisibility,
    setHiddenLabels,
    modelClasses,
    labelSource,
    studioFilePicker,
    labelPath,
  } = classes;
  const {
    plotAssembly,
    simplePlot,
    detectionsTable,
    lanesPanel,
    classesFilterModal,
  } = nodes;

  const playbackPanel = (
    <SpectrogramChromePlaybackPanel
      wavPath={wavPath}
      channel={channel}
      duration={duration}
      studioChrome={studioChrome}
      isProPlot={isProPlot}
      slots={{ transportSlot, toolsSlot, lcdSlot, zoomSlot }}
      playback={playback}
      tools={{ segmentNav }}
    />
  );

  const transportPortaled = studioChrome && showSpectrogram && transportSlot != null;
  const toolsPortaled = studioChrome && showSpectrogram && toolsSlot != null;
  const segmentPortaled = studioChrome && segmentSlot != null;

  const studioSegmentRail =
    studioChrome ? (
      <SpectrogramStudioSegmentRail
        meta={meta}
        channel={channel}
        duration={duration}
        wavPath={wavPath}
        viewStart={viewStart}
        viewSpan={viewSpan}
        segmentIndex={segmentNav.segmentIndex}
        showSpectrogram={showSpectrogram}
        onViewStartChange={setViewStartClamped}
        onSegmentSelect={applySegment}
        studioFilePicker={studioFilePicker ?? null}
        classesFilterOpen={classesFilterOpen}
        classesToolsOpen={classesToolsOpen ?? false}
        setClassesFilterOpen={setClassesFilterOpen}
        onClassesToolsOpenChange={onClassesToolsOpenChange}
        labelSource={labelSource ?? null}
        colormap={colormap}
        setColormap={setColormap}
      />
    ) : null;

  // Opacity + zoom + volume portal into the page toolbar via SpectrogramAudioPlayer.
  const studioToolsBar = null;

  const toolsPanel = (
    <SpectrogramChromeToolsPanel
      duration={duration}
      isProPlot={isProPlot}
      isScientific={isScientific}
      playback={{
        viewStart,
        viewEnd,
        viewSpan,
        playheadSec,
        markOpacity,
        setMarkOpacity,
        hasLabelPaths,
      }}
      tools={tools}
      classes={{ labelPath }}
    />
  );

  const segmentRailPanel = (
    <SpectrogramFileSegmentRail
      durationSec={duration}
      viewStart={viewStart}
      viewSpan={viewSpan}
      segmentIndex={segmentNav.segmentIndex}
      onViewStartChange={setViewStartClamped}
      onSegmentSelect={applySegment}
    />
  );

  const coordinatesPanel = (
    <SpectrogramCoordinatesBar
      timeSec={hoverCoords?.timeSec ?? playheadSec}
      frequencyLabel={cursorFrequency?.display ?? null}
      segmentIndex={segmentNav.segmentIndex}
    />
  );

  const controlDeck =
    transportPortaled ? null : (
      <SpectrogramLabControlDeck
        playback={playbackPanel}
        tools={studioChrome ? null : toolsPanel}
        segmentRail={studioChrome ? null : segmentRailPanel}
        coordinates={studioChrome ? null : coordinatesPanel}
        logicPro={isScientific}
        plotAbove={isScientific && !studioChrome}
      />
    );

  return (
    <>
      {!isProPlot ? (
        <>
          {playbackPanel}
          {toolsPanel}
        </>
      ) : null}

      {tileError && (
        <p className="font-mono text-[10px] text-foreground">{tileError}</p>
      )}

      {segmentHint && !studioChrome ? (
        <p className="font-mono text-[10px] text-foreground-muted">{segmentHint}</p>
      ) : null}

      {(labelsError || (tfBoundsNotice && !studioChrome)) && (
        <p
          className={`font-mono text-[10px] ${
            labelsError
              ? "text-amber-800 dark:text-amber-200"
              : "text-foreground-muted"
          }`}
        >
          {labelsError ?? tfBoundsNotice}
        </p>
      )}

      {exportMsg && (
        <p className="break-all font-mono text-[10px] text-foreground-muted">
          {exportMsg}
        </p>
      )}

      {transportPortaled ? playbackPanel : null}
      <SpectrogramStudioPortals
        studioChrome={studioChrome}
        showSpectrogram={showSpectrogram}
        toolsPortaled={toolsPortaled}
        toolsSlot={toolsSlot}
        studioToolsBar={studioToolsBar}
        classesToolsOpen={classesToolsOpen ?? false}
        classesToolsSlot={classesToolsSlot}
        classSidebarEntries={classSidebarEntries}
        modelClasses={modelClasses ?? null}
        hiddenLabels={hiddenLabels}
        labelColorMap={labelColorMap}
        confidenceMin={confidenceMin}
        setConfidenceMin={setConfidenceMin}
        showProbabilityLabels={showProbabilityLabels}
        setShowProbabilityLabels={setShowProbabilityLabels}
        overlayOnSpec={overlayOnSpec}
        setOverlayOnSpec={setOverlayOnSpec}
        hasLabels={hasLabels}
        toggleClassVisibility={toggleClassVisibility}
        setHiddenLabels={setHiddenLabels}
        segmentPortaled={segmentPortaled}
        studioSegmentRail={studioSegmentRail}
        segmentSlot={segmentSlot}
      />

      {isProPlot && !isScientific ? controlDeck : null}

      {showSpectrogram || !studioChrome ? (
        <div
          className={
            studioChrome
              ? "analysis-spectrogram-studio-stack"
              : "flex flex-col"
          }
        >
          {showSpectrogram && isProPlot ? (
            <>
              {isScientific ? plotAssembly : null}
              {isScientific ? (
                studioChrome ? null : controlDeck
              ) : (
                plotAssembly
              )}
            </>
          ) : showSpectrogram ? (
            simplePlot
          ) : null}
        </div>
      ) : null}

      {detectionsTable}
      {lanesPanel}
      {classesFilterModal}
    </>
  );
}
