import { PageHelpButton } from "../components/PageHelpButton";
import { PredictParamsRunStudio } from "../components/PredictParamsRunStudio";
import { PredictProfileSaveAsDialog } from "../components/PredictProfileSaveAsDialog";
import { PredictProjectPresetsBar } from "../components/PredictProjectPresetsBar";
import { PredictResultsExportAudacityDialog } from "../components/PredictResultsExportAudacityDialog";
import { PredictResultsModelSettingsModal } from "../components/PredictResultsModelSettingsModal";
import { PredictFilterTabPanel } from "../components/PredictFilterTabPanel";
import { PredictResultsTabPanel } from "../components/PredictResultsTabPanel";
import { PredictTabPanel, PredictTabs } from "../components/PredictTabs";
import { IconExport } from "../components/SpectrogramIcons";
import { NavIcon } from "../components/NavIcon";
import { usePredictPageState } from "../hooks/usePredictPageState";
import {
  createModelProfile,
  persistModelProfiles,
  settingsFromPredictSettings,
} from "../workspace/predictModelProfiles";
import { saveFilterSettings } from "../workspace/predictSettings";

export function PredictPage() {
  const m = usePredictPageState();
  const {
    navigate,
    navState,
    exportingResults,
    exportAudacityOpen,
    setExportAudacityOpen,
    predictTableBlocked,
    activeTab,
    setActiveTab,
    draftSettings,
    modelSettingsOpen,
    setModelSettingsOpen,
    queueViewFilter,
    setQueueViewFilter,
    profiles,
    setProfiles,
    activeProfileId,
    setActiveProfileId,
    saveAsOpen,
    setSaveAsOpen,
    filterSettings,
    setFilterSettings,
    models,
    setSpectrogramLabelOverride,
    analysisFocus,
    modelId,
    modelLabelName,
    running,
    orcaiReady,
    onSelectActive,
    handleSettingsChange,
    activeChannel,
    modelClasses,
    filterSourcePath,
    filterSources,
    filterTrackChannel,
    filterLimitsPath,
    onSelectPredictedPath,
    runnableCount,
    projectProfiles,
    presetDirty,
    queueReady,
    channelCollision,
    sharedOutputMultiFile,
    cliPreviewLine,
    queueBusy,
    resultsSpectrogramResolvedLabel,
    analysisLabelSource,
    onResultsDetectionTotalChange,
    resultsExportableFiles,
    resultsDoneFileCount,
    runAudacityExport,
    onToggleBatchSelect,
    tabs,
    savePreset,
    onSelectPreset,
    t,
    online,
    queue,
    setQueue,
    queueLoading,
    error,
    workspace,
    active,
    activeProject,
    queueUnavailable,
    onAddWavs,
    recordingTableRows,
    recordingTableError,
    batchRunning,
    batchProgress,
    overwriteDialog,
    filterSubmitting,
    onRunFilter,
    runBatchRecognition,
    onBatchCancel,
  } = m;

  return (
    <div className="predict-studio">
      <div className="studio-panel predict-work-panel">
        <div className="predict-page-header">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("pages.predict.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              {t("pages.predict.analysisGuide")}
            </p>
          </div>
          <div className="predict-page-header-actions">
            <span className="predict-page-crumb" aria-hidden={false}>
              {t("pages.predict.title")}
              <span className="predict-page-crumb-sep"> / </span>
              {activeTab === "run"
                ? t("predict.tabs.run")
                : activeTab === "results"
                  ? t("predict.tabs.results")
                  : t("predict.tabs.filter")}
            </span>
            <PageHelpButton
              topic={
                activeTab === "results"
                  ? "scope.studio"
                  : activeTab === "filter"
                    ? "scope.filter"
                    : "scope.params"
              }
              hint={
                activeTab === "results"
                  ? t("help.hint.predictResults")
                  : activeTab === "filter"
                    ? t("help.hint.predictFilter")
                    : t("help.hint.predictParams")
              }
            />
          </div>
        </div>

        <div className="predict-panel-body">
          <PredictResultsModelSettingsModal
            open={modelSettingsOpen}
            settings={draftSettings}
            models={models}
            onClose={() => setModelSettingsOpen(false)}
          />

          <PredictResultsExportAudacityDialog
            open={exportAudacityOpen}
            files={resultsExportableFiles}
            activeFileName={active?.name ?? null}
            busy={exportingResults}
            onCancel={() => setExportAudacityOpen(false)}
            onConfirm={runAudacityExport}
          />

          {!online && (
            <p className="pp-warn" role="status">
              {t("predict.importSidecarRequired")}
            </p>
          )}

          {!orcaiReady && online && (
            <p className="pp-warn" role="status">
              {t("predict.engineRequiredForPredict")}
            </p>
          )}

          {(error || recordingTableError) && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-700 dark:text-red-300">
              {error ?? recordingTableError}
            </p>
          )}

          <div className="predict-tabs-toolbar">
            <PredictTabs
              active={activeTab}
              onChange={setActiveTab}
              tabs={tabs}
              disabled={queueLoading && !queue}
              ariaLabel={t("predict.tabs.ariaLabel")}
              className="predict-tabs-m03"
            />
            {activeTab === "run" ? (
              <PredictProjectPresetsBar
                toolbar
                profiles={projectProfiles}
                activeProfileId={activeProfileId}
                dirty={presetDirty}
                disabled={batchRunning}
                onSelect={onSelectPreset}
                onSave={savePreset}
                onSaveAs={() => setSaveAsOpen(true)}
              />
            ) : null}
            {activeTab === "results" || activeTab === "filter" ? (
              <div className="predict-results-page-actions">
                {activeTab === "results" ? (
                  <button
                    type="button"
                    className="predict-results-page-btn predict-results-page-btn--filled"
                    title={t("predict.results.exportHint")}
                    disabled={
                      !queueReady ||
                      !queue ||
                      !orcaiReady ||
                      !online ||
                      batchRunning ||
                      exportingResults ||
                      resultsDoneFileCount === 0
                    }
                    onClick={() => setExportAudacityOpen(true)}
                  >
                    <span className="predict-results-page-btn__icon" aria-hidden>
                      <IconExport />
                    </span>
                    {exportingResults
                      ? t("common.loading")
                      : t("predict.results.export")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="predict-results-page-btn predict-results-page-btn--filled"
                  title={t("predict.results.toTableHint")}
                  disabled={
                    !queueReady ||
                    !orcaiReady ||
                    !online ||
                    resultsDoneFileCount === 0
                  }
                  onClick={() => navigate("/results")}
                >
                  <span className="predict-results-page-btn__icon" aria-hidden>
                    <NavIcon id="results" />
                  </span>
                  {t("predict.results.toTable")}
                </button>
              </div>
            ) : null}
          </div>

          <PredictTabPanel id="run" active={activeTab}>
            <PredictParamsRunStudio
              queue={queueReady ? queue : null}
              queueUnavailable={queueUnavailable}
              queueLoading={queueLoading}
              orcaiReady={orcaiReady}
              batchRunning={batchRunning}
              models={models}
              settings={draftSettings}
              onSettingsChange={handleSettingsChange}
              viewFilter={queueViewFilter}
              onFilterChange={setQueueViewFilter}
              commandLine={cliPreviewLine}
              channelCollision={channelCollision}
              sharedOutputWarn={sharedOutputMultiFile}
              runnableCount={queueReady ? runnableCount : 0}
              tableBlocked={predictTableBlocked}
              batchProgress={batchProgress}
              canManageFiles={
                online && queueReady && Boolean(activeProject?.initialized)
              }
              busy={queueBusy}
              runningFileName={running?.name ?? null}
              activeFileName={queue?.activeFileName ?? null}
              onSelectActive={onSelectActive}
              onToggleBatchSelect={onToggleBatchSelect}
              onAddWavs={() => void onAddWavs()}
              onRunBatch={() => void runBatchRecognition()}
              onBatchCancel={onBatchCancel}
              recordingTableRows={recordingTableRows}
            />
          </PredictTabPanel>

          <PredictTabPanel id="results" active={activeTab}>
            {queueReady && queue ? (
              <PredictResultsTabPanel
                queue={queue}
                batchRunning={batchRunning}
                active={active}
                channel={activeChannel}
                modelId={modelId}
                modelLabelName={modelLabelName}
                modelClasses={modelClasses}
                resolvedLabelPath={resultsSpectrogramResolvedLabel}
                predictThreshold={draftSettings.threshold}
                labelSource={analysisLabelSource}
                onSelectActive={onSelectActive}
                onLabelOverride={setSpectrogramLabelOverride}
                onQueueChange={setQueue}
                onDetectionTotalChange={onResultsDetectionTotalChange}
                focusNav={
                  analysisFocus &&
                  (!navState.wavPath || navState.wavPath === active?.path)
                    ? analysisFocus
                    : null
                }
              />
            ) : (
              <p className="text-sm text-foreground-muted">
                {t("predict.tabs.needQueue")}
              </p>
            )}
          </PredictTabPanel>

          <PredictTabPanel id="filter" active={activeTab}>
            {queueReady && queue ? (
              <PredictFilterTabPanel
                sources={filterSources}
                activePredictedPath={filterSourcePath}
                onSelectPredictedPath={onSelectPredictedPath}
                limitsPath={filterLimitsPath}
                labelSuffix={draftSettings.labelSuffix.trim()}
                filterSettings={filterSettings}
                filterSubmitting={filterSubmitting}
                orcaiReady={orcaiReady}
                batchRunning={batchRunning}
                channel={filterTrackChannel}
                onFilterSettingsChange={(next) => {
                  setFilterSettings(next);
                  saveFilterSettings(next);
                }}
                onApply={onRunFilter}
              />
            ) : (
              <p className="text-sm text-foreground-muted">
                {t("predict.tabs.needQueue")}
              </p>
            )}
          </PredictTabPanel>

          <PredictProfileSaveAsDialog
            open={saveAsOpen}
            initialName={
              workspace.projectName ? `${workspace.projectName}` : "Preset"
            }
            onCancel={() => setSaveAsOpen(false)}
            onConfirm={(name) => {
              const { profiles: next, profile } = createModelProfile(
                profiles,
                name,
                settingsFromPredictSettings(draftSettings),
                "",
                workspace.activeProjectId,
              );
              setProfiles(next);
              setActiveProfileId(profile.id);
              persistModelProfiles(next, profile.id);
              setSaveAsOpen(false);
            }}
          />
          {overwriteDialog}
        </div>
      </div>
    </div>
  );
}
