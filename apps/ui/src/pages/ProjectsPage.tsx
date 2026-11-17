import clsx from "clsx";
import { PageHelpButton } from "../components/PageHelpButton";
import { ProjectAnnotationsTab } from "../components/projects/ProjectAnnotationsTab";
import { ProjectArtifactsTab } from "../components/projects/ProjectArtifactsTab";
import { ProjectCreateWizard } from "../components/projects/ProjectCreateWizard";
import {
  DeleteProjectDialog,
  DeleteRecordingsDialog,
  RefreshTableDialog,
} from "../components/projects/ProjectDialogs";
import { ProjectHeaderCard } from "../components/projects/ProjectHeaderCard";
import { ProjectParametersTab } from "../components/projects/ProjectParametersTab";
import { ProjectReadinessPanel } from "../components/projects/ProjectReadinessPanel";
import { ProjectRecordingsTab } from "../components/projects/ProjectRecordingsTab";
import { ProjectTabs } from "../components/projects/ProjectTabs";
import { IconSearch, IconTrain } from "../components/projects/ProjectsIcons";
import { ProjectListModal } from "../components/projects/ProjectListModal";
import { ProjectsActionsBar } from "../components/projects/ProjectsActionsBar";
import { ProjectNoSelectionEmpty } from "../components/projects/ProjectNoSelectionEmpty";
import { useProjectsPageModel } from "../hooks/useProjectsPageModel";
import { formatProjectError } from "../lib/projectErrors";
import { revealInFileManager } from "../platform/shell";
import { applyActiveProject } from "../workspace/project";

export function ProjectsPage() {
  const m = useProjectsPageModel();
  const {
    t, engineReady, sidecarOnline, workspace, projects, selectedId, detail, summary, summaryLoading,
    table, tableLoading, annotations, annotationsLoading, artifacts, artifactsLoading,
    parameters, parametersLoading, tab, setTab, showNextSteps, setShowNextSteps,
    showAllColumns, setShowAllColumns, selectedRows, refreshOpen, setRefreshOpen,
    deleteFilesOpen, setDeleteFilesOpen, deleteProjectOpen, setDeleteProjectOpen,
    listOpen, setListOpen, deleteTarget, setDeleteTarget, error, setError,
    busy, focus, visibleTabs, guidedAction, guidedTab, wavCount, mode,
    isActive, canModify, autoSyncCsv, tableNeedsRefresh, predictBlocked, onConfirmRefresh,
    view, wizardFocus, setWizardFocus, wizardName, wizardParent, wizardPhase,
    wizardError, openWizard, cancelWizard, onWizardPickParent,
    onWizardNext, onWizardDisplayName, selectProject, onOpenFolder, onOpenExisting,
    onChangeFocus, onDeleteProject, onInit, onAddWav, onAddAnnotations, onDeleteAnnotations,
    onConfirmDeleteFiles, onChannelChange, toggleRow, onToggleAutoSyncCsv, onPredict,
    trainWizardBlocked, onOpenTraining, onNextStep, onValidateParameters, onSaveParameters,
    onExportParameters, subtitle, tabCounts,
    importWavPaths, importAnnotationPaths, refreshList, setSelectedRows,
  } = m;

  return (
    <div className="projects-studio projects-page">
      <div className="studio-panel projects-work-panel">
        <div
          className={clsx(
            "projects-page-header",
            view === "wizard" && "projects-page-header--wizard",
          )}
        >
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("pages.projects.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{subtitle}</p>
          </div>
          <PageHelpButton />
        </div>

        <div
          className={clsx(
            "projects-panel-body",
            view === "wizard" && "projects-panel-body--wizard",
            view !== "wizard" && detail && "projects-panel-body--project",
            view !== "wizard" && !detail && "projects-panel-body--empty",
          )}
        >
          {view === "wizard" ? (
            <ProjectCreateWizard
              focus={wizardFocus}
              displayName={wizardName}
              parentDir={wizardParent}
              phase={wizardPhase}
              busy={busy}
              sidecarOnline={sidecarOnline}
              error={wizardError}
              onFocus={setWizardFocus}
              onDisplayName={onWizardDisplayName}
              onPickParent={() => void onWizardPickParent()}
              onCancel={cancelWizard}
              onNext={() => void onWizardNext()}
            />
          ) : (
            <div className="ps-project-workspace">
              {/* Work toolbar belongs to an open project (m02/m33) — hide when none selected. */}
              {detail ? (
                <ProjectsActionsBar
                  hasProject
                  busy={busy}
                  onCreate={openWizard}
                  onOpenFolder={onOpenFolder}
                  onOpenProjectList={() => {
                    void refreshList().catch((err) =>
                      setError(formatProjectError(err, t)),
                    );
                    setListOpen(true);
                  }}
                />
              ) : null}

              {error ? (
                <p className="ps-hint-bar is-err whitespace-pre-wrap font-mono text-xs" role="alert">
                  {error}
                </p>
              ) : null}

              {!sidecarOnline && !detail ? (
                <ProjectNoSelectionEmpty
                  busy={busy}
                  sidecarOnline={false}
                  onCreate={openWizard}
                  onOpenExisting={() => void onOpenExisting()}
                />
              ) : !detail ? (
                selectedId ? (
                  <div className="ps-empty">
                    <div>
                      <h3 className="ps-empty-title">{t("projects.expandLoading")}</h3>
                    </div>
                  </div>
                ) : (
                  <ProjectNoSelectionEmpty
                    busy={busy}
                    sidecarOnline={sidecarOnline}
                    onCreate={openWizard}
                    onOpenExisting={() => void onOpenExisting()}
                  />
                )
              ) : (
                <div className="ps-project-stage">
                  <ProjectHeaderCard
                    project={detail}
                    summary={summary}
                    table={table}
                    focus={focus}
                    isActive={isActive}
                    busy={busy}
                    engineReady={engineReady}
                    onChangeFocus={(f) => void onChangeFocus(f)}
                    onDelete={() => {
                      setDeleteTarget(detail);
                      setDeleteProjectOpen(true);
                    }}
                    onInit={() => void onInit()}
                  />

                  <div className="ps-project-stage-body">
                    <ProjectReadinessPanel
                      summary={summary}
                      focus={focus}
                      loading={summaryLoading}
                      online={sidecarOnline}
                      showNextSteps={showNextSteps}
                      onToggleNextSteps={() => setShowNextSteps((v) => !v)}
                      onNextStep={onNextStep}
                    />

                    <ProjectTabs
                      active={tab}
                      tabs={visibleTabs}
                      guidedTab={guidedTab}
                      counts={tabCounts}
                      onChange={setTab}
                      trailing={
                        tab === "recordings" &&
                        (mode === "field" || mode === "full") ? (
                          <button
                            type="button"
                            className={clsx(
                              "ps-btn",
                              guidedAction === "predict"
                                ? "ps-btn-attention"
                                : "ps-btn-primary",
                            )}
                            onClick={() => void onPredict()}
                            disabled={busy || wavCount === 0 || predictBlocked}
                            title={
                              predictBlocked
                                ? t("projects.studio.table.predictBlockedStale")
                                : selectedRows.size > 0
                                  ? t("projects.openInPredictSelection")
                                  : t("projects.openInPredictAllWavs")
                            }
                          >
                            <IconSearch />
                            {t("projects.studio.actions.predict")}
                          </button>
                        ) : (mode === "lab" || mode === "full") &&
                          tab === "annotations" ? (
                          <button
                            type="button"
                            className={clsx(
                              "ps-btn",
                              guidedAction === "train" && !trainWizardBlocked
                                ? "ps-btn-attention"
                                : "ps-btn-primary",
                            )}
                            onClick={onOpenTraining}
                            disabled={busy || trainWizardBlocked}
                          >
                            <IconTrain />
                            {t("projects.studio.actions.trainWizard")}
                          </button>
                        ) : null
                      }
                    />

                    <div
                      role="tabpanel"
                      id={`projects-panel-${tab}`}
                      aria-labelledby={`projects-tab-${tab}`}
                      className="ps-project-tabpanel"
                    >
                      {tab === "recordings" ? (
                        <ProjectRecordingsTab
                          table={table}
                          loading={tableLoading}
                          mode={mode}
                          selected={selectedRows}
                          busy={busy}
                          canModify={canModify}
                          engineReady={engineReady}
                          showAllColumns={showAllColumns}
                          autoSyncCsv={autoSyncCsv}
                          tableNeedsRefresh={tableNeedsRefresh}
                          guidedAction={
                            guidedAction === "sync_table" || guidedAction === "predict"
                              ? (guidedAction as "sync_table" | "predict")
                              : null
                          }
                          onToggleColumns={() => setShowAllColumns((v) => !v)}
                          onToggleAutoSyncCsv={(enabled) => void onToggleAutoSyncCsv(enabled)}
                          onToggleRow={toggleRow}
                          onSelectAll={() =>
                            setSelectedRows(new Set((table?.rows ?? []).map((r) => r.recording)))
                          }
                          onClearSelection={() => setSelectedRows(new Set())}
                          onRefreshTable={() => setRefreshOpen(true)}
                          onAddWav={() => void onAddWav()}
                          onImportWavPaths={(paths) => void importWavPaths(paths)}
                          onDeleteSelected={() => setDeleteFilesOpen(true)}
                          onChannelChange={(recording, channel) =>
                            void onChannelChange(recording, channel)
                          }
                        />
                      ) : null}
                      {tab === "annotations" ? (
                        <ProjectAnnotationsTab
                          data={annotations}
                          loading={annotationsLoading}
                          mode={mode}
                          busy={busy}
                          canModify={canModify}
                          onAddAnnotations={() => void onAddAnnotations()}
                          onImportPaths={(paths) => void importAnnotationPaths(paths)}
                          onDeleteAnnotations={(names) => void onDeleteAnnotations(names)}
                          onOpenAnnotationsFolder={() => {
                            const dir = annotations?.annotations_dir;
                            if (dir) void revealInFileManager(dir);
                          }}
                        />
                      ) : null}
                      {tab === "artifacts" ? (
                        <ProjectArtifactsTab
                          data={artifacts}
                          loading={artifactsLoading}
                          onOpen={(path) => void revealInFileManager(path)}
                        />
                      ) : null}
                      {tab === "parameters" ? (
                        <ProjectParametersTab
                          data={parameters}
                          loading={parametersLoading}
                          busy={busy}
                          onValidate={onValidateParameters}
                          onSave={onSaveParameters}
                          onExport={onExportParameters}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ProjectListModal
        open={listOpen}
        projects={projects}
        currentProjectId={selectedId}
        activeProjectId={workspace.activeProjectId}
        busy={busy}
        onClose={() => setListOpen(false)}
        onOpen={(project) => {
          applyActiveProject(project);
          selectProject(project.id);
          setListOpen(false);
          void refreshList().catch((err) => setError(formatProjectError(err, t)));
        }}
        onDelete={(project) => {
          setListOpen(false);
          setDeleteTarget(project);
          setDeleteProjectOpen(true);
        }}
      />

      <RefreshTableDialog
        open={refreshOpen && detail != null}
        tableExists={Boolean(table?.table_exists ?? detail?.recording_table_path)}
        busy={busy}
        defaultChannel={table?.default_channel ?? 1}
        onConfirm={(choice) => void onConfirmRefresh(choice)}
        onClose={() => setRefreshOpen(false)}
      />

      <DeleteRecordingsDialog
        open={deleteFilesOpen && detail != null}
        count={selectedRows.size}
        busy={busy}
        onConfirm={() => void onConfirmDeleteFiles()}
        onClose={() => setDeleteFilesOpen(false)}
      />

      <DeleteProjectDialog
        open={deleteProjectOpen && deleteTarget != null}
        busy={busy}
        onDelete={(files) => void onDeleteProject(files)}
        onClose={() => {
          setDeleteProjectOpen(false);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
