import { Link } from "react-router-dom";
import { RuntimeReadyLamp } from "../components/RuntimeReadyLamp";
import { PageHelpButton } from "../components/PageHelpButton";
import { PipelineParamsModal } from "../components/PipelineParamsModal";
import { PipelineReadinessPanel } from "../components/pipeline/PipelineReadiness";
import { PipelineBoardSteps } from "../components/pipeline/PipelineBoardSteps";
import { IconPlus, IconRefresh } from "../components/projects/ProjectsIcons";
import { usePipelineBoard } from "../hooks/usePipelineBoard";
import { PipelineErrorAlert } from "../components/PipelineErrorAlert";
import { splitLabel } from "../lib/trainPipeline";
import { TrainWizard } from "../trainWizard/TrainWizard";

export function PipelinePage() {
  const m = usePipelineBoard();
  const {
    projectId,
    locale,
    board,
    loading,
    refreshing,
    error,
    notice,
    busyId,
    moreId,
    setMoreId,
    paramsOpen,
    setParamsOpen,
    hpsearchParallel,
    setHpsearchParallel,
    load,
    refreshBoard,
    activePlan,
    wizardPlanActive,
    annotationsBlockTrain,
    hpsearchBlockedByPlan,
    monitorAvailable,
    monitorLive,
    openMonitorWindow,
    setView,
    setOptimisticPlan,
    runStep,
    cancelStep,
    cancelWizardPlan,
    openArtifact,
    exportParams,
    manualHintStepId,
    wizardAwaitingBoard,
    showTrainWizard,
    wizardInitialScenario,
    wizardInitialBaseModel,
    t,
    engineReady,
  } = m;

  // Do not mount the wizard until the board has loaded — otherwise a deep-link
  // races past an existing active_plan while board === null. If the board fetch
  // failed, fall through to the board UI (fail-closed) instead of opening wizard.
  if (wizardAwaitingBoard) {
    return (
      <div className="pp-page">
        <div className="studio-panel pp-work-panel">
          <p className="pp-empty">{t("common.loading")}</p>
        </div>
      </div>
    );
  }
  if (showTrainWizard) {
    return (
      <TrainWizard
        initialScenario={wizardInitialScenario}
        initialBaseModel={wizardInitialBaseModel}
        onClose={(result) => {
          setView("board");
          if (result?.planId) {
            setOptimisticPlan({
              plan_id: result.planId,
              job_id: result.firstJobId ?? null,
              queued: result.jobCount ?? 0,
              running: 0,
              includes_hpsearch: Boolean(result.includesHpsearch),
              commands: result.commands,
            });
            void load(true, true);
          }
        }}
      />
    );
  }

  return (
    <div className="pp-page">
      <div className="studio-panel pp-work-panel">
        <div className="pp-page-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-foreground">
                {t("pages.pipeline.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                {t("pages.pipeline.description")}
              </p>
            </div>
            <PageHelpButton topic="train.pipeline" hint={t("help.hint.train")} />
          </div>
        </div>

        <div className="pp-toolbar">
          <div className="jobs-toolbar-filters predict-tabs-m03" role="tablist" aria-label={t("pipeline.entryGroup")}>
            <button
              type="button"
              role="tab"
              className="predict-tab"
              aria-selected={false}
              disabled={wizardPlanActive || annotationsBlockTrain}
              title={wizardPlanActive ? t("pipeline.planBusyHint") : undefined}
              onClick={() => {
                if (!annotationsBlockTrain) setView("wizard");
              }}
            >
              <IconPlus />
              {t("pipeline.wizard")}
            </button>
            <button
              type="button"
              role="tab"
              className="predict-tab"
              aria-selected={false}
              disabled={!monitorAvailable}
              title={
                !monitorAvailable
                  ? t("pipeline.monitorIdleHint")
                  : monitorLive
                    ? t("pipeline.monitorLiveHint")
                    : undefined
              }
              onClick={() => {
                if (monitorAvailable) openMonitorWindow();
              }}
            >
              <RuntimeReadyLamp
                state={monitorLive ? "running" : "off"}
                className="pp-monitor-lamp"
                aria-label={
                  monitorLive
                    ? t("pipeline.monitorLiveHint")
                    : t("pipeline.monitorLampOff")
                }
              />
              {t("pipeline.monitor")}
            </button>
          </div>
          <p className="pp-toolbar-hint">
            {wizardPlanActive ? t("pipeline.planBusyHint") : t("pipeline.manualHint")}
          </p>
          <div className="predict-tabs-m03 pp-refresh-wrap">
            <button
              type="button"
              className="predict-tab"
              onClick={() => void refreshBoard()}
              disabled={!projectId || refreshing}
              aria-busy={refreshing}
              title={t("pipeline.refresh")}
            >
              <IconRefresh className={refreshing ? "pp-refresh-spin" : undefined} />
              {t("pipeline.refresh")}
            </button>
          </div>
        </div>

        {error && !wizardPlanActive ? <p className="pp-error">{error}</p> : null}
        {notice ? <p className="pp-notice">{notice}</p> : null}
        {(() => {
          if (!board || wizardPlanActive) return null;
          // Real job failures still get a remediation banner; blocked/stale
          // reasons only yellow-hint the step to run (no long reasonHelp text).
          const withJobError = board.steps.find(
            (s) => s.status === "error" && typeof s.error === "string" && s.error.trim(),
          );
          if (!withJobError?.error) return null;
          return (
            <PipelineErrorAlert
              raw={withJobError.error}
              stepId={withJobError.id}
              className="pp-train-alert"
            />
          );
        })()}

        {!projectId ? (
          <p className="pp-empty">
            {t("pipeline.noProject")}{" "}
            <Link to="/projects" className="underline">
              {t("nav.projects")}
            </Link>
          </p>
        ) : board ? (
          <div className="pp-body">
            <section className="pp-col-side pp-left-united">
                <PipelineReadinessPanel board={board} locale={locale} t={t} />
                <div className="pp-split-rule" aria-hidden />
                <div className="pp-left-pane">
                  <h2 className="pp-card-kicker">{t("pipeline.params")}</h2>
                  <dl className="pp-params">
                    <dt>{t("pipeline.param.architecture")}</dt>
                    <dd>{board.parameters.architecture}</dd>
                    <dt>{t("pipeline.param.rate")}</dt>
                    <dd>
                      {board.parameters.sampling_rate.toLocaleString(locale)} {t("pipeline.param.hz")}
                    </dd>
                    <dt>{t("pipeline.param.nfft")}</dt>
                    <dd>
                      {board.parameters.nfft} / {board.parameters.n_overlap}
                    </dd>
                    <dt>{t("pipeline.param.freq")}</dt>
                    <dd>
                      {board.parameters.freq_low.toLocaleString(locale)} –{" "}
                      {board.parameters.freq_high.toLocaleString(locale)} {t("pipeline.param.hz")}
                    </dd>
                    <dt>{t("pipeline.param.snippet")}</dt>
                    <dd>
                      {board.parameters.snippet_duration} {t("pipeline.param.sec")} ·{" "}
                      {board.parameters.snippets_per_sec} {t("pipeline.param.perSec")}
                    </dd>
                    <dt>{t("pipeline.param.split")}</dt>
                    <dd>
                      {splitLabel(
                        board.parameters.split_train,
                        board.parameters.split_val,
                        board.parameters.split_test,
                      )}
                    </dd>
                    <dt>{t("pipeline.param.epochs")}</dt>
                    <dd>
                      {board.parameters.epochs} · {board.parameters.batch_size}
                    </dd>
                  </dl>
                  <p className="pp-param-file">{board.parameter_filename}</p>
                  <div className="pp-param-actions">
                    <button
                      type="button"
                      className="settings-path-btn"
                      onClick={() => setParamsOpen(true)}
                      disabled={!board.parameter_exists || wizardPlanActive}
                      title={wizardPlanActive ? t("pipeline.planBusyHint") : undefined}
                    >
                      {t("pipeline.editParams")}
                    </button>
                    <button
                      type="button"
                      className="settings-path-btn"
                      onClick={() => void exportParams()}
                      disabled={!board.parameter_exists}
                    >
                      {t("pipeline.exportParams")}
                    </button>
                  </div>
                </div>
            </section>

            <section className="pp-col-board">
              {wizardPlanActive ? (
                <div className="pp-plan-banner" role="status">
                  <div className="pp-plan-banner-text">
                    <p className="pp-plan-banner-title">
                      {t("pipeline.planBusyTitle")}
                    </p>
                    <p className="pp-plan-banner-body">
                      {t("pipeline.planBusyBody", {
                        running: activePlan?.running ?? 0,
                        queued: activePlan?.queued ?? 0,
                      })}
                    </p>
                  </div>
                  {activePlan?.job_id ? (
                    <button
                      type="button"
                      className="pp-btn"
                      disabled={busyId != null}
                      onClick={() => void cancelWizardPlan()}
                    >
                      {t("pipeline.planCancel")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="pp-col-head">
                <h2>{t("pipeline.board")}</h2>
                <span className="pp-col-note">{t("pipeline.boardNote")}</span>
              </div>
                            <PipelineBoardSteps
                board={board}
                locale={locale}
                t={t}
                busyId={busyId}
                moreId={moreId}
                setMoreId={setMoreId}
                hpsearchParallel={hpsearchParallel}
                setHpsearchParallel={setHpsearchParallel}
                wizardPlanActive={wizardPlanActive}
                hpsearchBlockedByPlan={hpsearchBlockedByPlan}
                manualHintStepId={manualHintStepId}
                engineReady={engineReady}
                cancelStep={cancelStep}
                openArtifact={openArtifact}
                runStep={runStep}
              />
            </section>
          </div>
        ) : loading ? (
          <p className="pp-empty">{t("common.loading")}</p>
        ) : (
          <p className="pp-empty">{t("pipeline.noProject")}</p>
        )}
      </div>
      <PipelineParamsModal
        open={paramsOpen}
        projectId={projectId}
        onClose={() => setParamsOpen(false)}
        onSaved={() => void load(true, true)}
      />
    </div>
  );
}
