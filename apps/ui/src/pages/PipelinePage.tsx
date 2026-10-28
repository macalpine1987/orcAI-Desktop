import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { cancelJob, createJob } from "../api/jobs";
import {
  fetchProjectParameters,
  fetchProjectPipeline,
  type PipelineActivePlan,
  type PipelineReadinessLamp,
  type PipelineStepState,
  type ProjectPipeline,
} from "../api/projects";
import { PageHelpButton } from "../components/PageHelpButton";
import { PipelineParamsModal } from "../components/PipelineParamsModal";
import { IconPlus, IconRefresh } from "../components/projects/ProjectsIcons";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSaveNotice } from "../ui/saveNotice";
import { isAbortError } from "../lib/fetchErrors";
import { joinFsPath } from "../lib/joinFsPath";
import { PipelineErrorAlert } from "../components/PipelineErrorAlert";
import {
  artifactCountKey,
  formatBytesLocalized,
  formatPipelineStamp,
  splitLabel,
  TRAIN_PIPELINE_STEP_IDS,
  pipelineBlockedWithoutAnnotations,
  wizardPlanBlocksHpsearch,
} from "../lib/trainPipeline";
import {
  hintStepForPipelineReason,
  isPipelineReasonId,
} from "../lib/pipelineReasonExplain";
import {
  classifyPipelineError,
  pipelineErrorCopy,
  resolveErrorLang,
} from "../lib/pipelineErrorExplain";
import { pickJsonOutputFile } from "../platform/dialog";
import { revealInFileManager, writeTextFileAbsolute } from "../platform/shell";
import { isTauri } from "../platform/tauri";
import {
  clearSnippetsReadiness,
  publishSnippetsReadiness,
} from "../lib/pipelineSnippetsReadiness";
import {
  PROJECT_PARAMETERS_SAVED_EVENT,
  type ProjectParametersSavedDetail,
} from "../lib/projectParametersEvents";
import { pipelineNavInactiveForWorkspace } from "../layout/navigation";
import { TrainMonitor } from "../trainMonitor/TrainMonitor";
import { TrainWizard } from "../trainWizard/TrainWizard";

const POLL_IDLE_MS = 2000;
const POLL_BUSY_MS = 750;

function readinessLampTone(state: PipelineReadinessLamp): string {
  if (state === "warn") return "is-active";
  if (state === "off") return "is-stopped";
  if (state === "info") return "is-available";
  return "is-ready";
}

function PipelineStatusPill({ status }: { status: PipelineStepState["status"] }) {
  const { t } = useTranslation();
  const tone =
    status === "done"
      ? "completed"
      : status === "running"
        ? "running"
        : status === "queued"
          ? "pending"
          : status === "blocked" || status === "error"
            ? "failed"
            : status === "stale"
              ? "stale"
              : "pending";
  return (
    <span className={clsx("job-status-pill", `job-status-pill--${tone}`)}>
      <span className={clsx("jobs-status-dot", `jobs-status-dot--${tone}`)} aria-hidden />
      {t(`pipeline.status.${status}`)}
    </span>
  );
}

function JewelLamp({ tone }: { tone: string }) {
  return (
    <span className={clsx("runtime-row-lamp", tone)} aria-hidden>
      <span className="runtime-row-lamp-well">
        <span className="runtime-row-lamp-jewel" />
      </span>
    </span>
  );
}

function stepMetaPrimary(
  step: PipelineStepState,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: string,
): string {
  if (step.status === "error" && step.error) {
    const kind = classifyPipelineError(step.error);
    const copy = pipelineErrorCopy(kind, resolveErrorLang(locale));
    return t(`pipeline.errors.${kind}.title`, { defaultValue: copy.title });
  }
  if (
    (step.status === "blocked" || step.status === "stale" || step.status === "error") &&
    step.reason
  ) {
    return t(`pipeline.reason.${step.reason}`, { defaultValue: step.reason });
  }
  const parts: string[] = [];
  if (step.artifact_label) parts.push(step.artifact_label);
  if (step.file_count) {
    parts.push(t(artifactCountKey(step.artifact_kind), { count: step.file_count }));
  } else if (step.artifact_kind === "datasets" || step.artifact_kind === "models") {
    parts.push(t(artifactCountKey(step.artifact_kind), { count: 0 }));
  }
  if (step.size_bytes) parts.push(formatBytesLocalized(step.size_bytes, locale));
  return parts.join(" · ") || "—";
}

export function PipelinePage() {
  const { t, i18n } = useTranslation();
  const { notifySaved } = useSaveNotice();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "monitor" ? "monitor" : params.get("view") === "wizard" ? "wizard" : "board";
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { engineReady } = useSidecarStatus();
  const trackJobInLab = useTrackJobInLab();
  const projectId = workspace.activeProjectId;
  const locale = i18n.language || "en";

  const [board, setBoard] = useState<ProjectPipeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [optimisticPlan, setOptimisticPlan] = useState<PipelineActivePlan | null>(
    null,
  );
  const noticeTimer = useRef<number | null>(null);

  const flashNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current != null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 2500);
  }, []);

  useEffect(() => {
    if (pipelineNavInactiveForWorkspace(workspace)) {
      navigate("/", { replace: true });
    }
  }, [navigate, workspace]);

  // Isolated hpsearch is a pipeline step — not a third wizard scenario.
  useEffect(() => {
    if (params.get("view") !== "wizard" || params.get("scenario") !== "hpsearch") {
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("view");
    next.delete("scenario");
    setParams(next, { replace: true });
    flashNotice(t("wizard.hpsearchRedirected"));
  }, [params, setParams, flashNotice, t]);

  const load = useCallback(
    async (silent = false) => {
      if (!projectId) {
        setBoard(null);
        clearSnippetsReadiness();
        return;
      }
      if (!silent) setLoading(true);
      try {
        const data = await fetchProjectPipeline(projectId);
        setBoard(data);
        publishSnippetsReadiness(data.readiness.snippets);
        setError(null);
      } catch (err) {
        if (isAbortError(err)) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectId],
  );

  const refreshBoard = useCallback(async () => {
    if (!projectId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await fetchProjectPipeline(projectId);
      setBoard(data);
      publishSnippetsReadiness(data.readiness.snippets);
      flashNotice(t("pipeline.refreshed"));
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRefreshing(false);
    }
  }, [projectId, refreshing, flashNotice, t]);

  useEffect(() => {
    void load();
    return () => clearSnippetsReadiness();
  }, [load]);

  useEffect(() => {
    if (!projectId) return;
    const onSaved = (ev: Event) => {
      const detail = (ev as CustomEvent<ProjectParametersSavedDetail>).detail;
      if (detail?.projectId !== projectId) return;
      void load(true);
    };
    window.addEventListener(PROJECT_PARAMETERS_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(PROJECT_PARAMETERS_SAVED_EVENT, onSaved);
  }, [load, projectId]);

  useEffect(() => {
    setParamsOpen(false);
    setNotice(null);
    setOptimisticPlan(null);
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current != null) window.clearTimeout(noticeTimer.current);
    };
  }, []);
  const pipelineBusy = Boolean(
    board?.steps.some((s) => s.status === "running" || s.status === "queued"),
  );
  const activePlan = board?.active_plan ?? optimisticPlan;
  const wizardPlanActive = Boolean(activePlan);
  const annotationsBlockTrain = pipelineBlockedWithoutAnnotations(board);
  const hpsearchBlockedByPlan = wizardPlanBlocksHpsearch(activePlan);

  // Deep-link / Models «Дообучить» must not open a second wizard over an active plan.
  useEffect(() => {
    if (params.get("view") !== "wizard") return;
    if (params.get("scenario") === "hpsearch") return;
    if (!wizardPlanActive) return;
    const next = new URLSearchParams(params);
    next.delete("view");
    next.delete("scenario");
    next.delete("base");
    setParams(next, { replace: true });
    flashNotice(t("wizard.planBusyRedirected"));
  }, [params, setParams, flashNotice, t, wizardPlanActive]);

  // Fail-closed optimistic plan: never drop on a blind timer while the board
  // fetch is failing (that unlocked a second wizard). Hand off when the server
  // reports the same plan_id; clear after a short grace only when the board
  // loaded cleanly with no active plan and no running/queued steps.
  useEffect(() => {
    if (!optimisticPlan) return;
    if (board?.active_plan?.plan_id === optimisticPlan.plan_id) {
      setOptimisticPlan(null);
      return;
    }
    if (!board || error) return;
    if (board.active_plan) return;
    const stepsBusy = board.steps.some(
      (s) => s.status === "running" || s.status === "queued",
    );
    if (stepsBusy) return;
    const id = window.setTimeout(() => {
      setOptimisticPlan((cur) =>
        cur?.plan_id === optimisticPlan.plan_id ? null : cur,
      );
    }, 3000);
    return () => window.clearTimeout(id);
  }, [board, optimisticPlan, error]);

  useEffect(() => {
    if (!projectId) return;
    const intervalMs = pipelineBusy || wizardPlanActive ? POLL_BUSY_MS : POLL_IDLE_MS;
    const id = window.setInterval(() => void load(true), intervalMs);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, projectId, pipelineBusy, wizardPlanActive]);

  const setView = (next: "board" | "wizard" | "monitor") => {
    const q = new URLSearchParams(params);
    if (next === "board") q.delete("view");
    else q.set("view", next);
    setParams(q, { replace: true });
  };

  useEffect(() => {
    if (view === "wizard" && annotationsBlockTrain) {
      setView("board");
    }
  }, [view, annotationsBlockTrain]); // setView closes over the current query

  const runStep = async (step: PipelineStepState, overwrite = false) => {
    if (
      !engineReady ||
      !step.can_run ||
      wizardPlanActive ||
      (step.id === "hpsearch" && hpsearchBlockedByPlan) ||
      step.status === "blocked" ||
      step.status === "running" ||
      step.status === "queued"
    ) {
      return;
    }
    setBusyId(step.id);
    setError(null);
    setMoreId(null);
    try {
      const body: Record<string, unknown> = { ...step.run_params };
      const projectDir = workspace.projectDir ?? String(body.project_dir ?? "");
      if (projectDir && !body.project_dir) body.project_dir = projectDir;
      if (overwrite || step.status === "stale" || step.status === "done") {
        body.overwrite = true;
      }
      // Keep joinFsPath in this page: fallback artifact dir if API omits it.
      if (!body.output_dir && projectDir && step.id === "create-spectrograms") {
        body.output_dir = joinFsPath(projectDir, "recording_data");
      }
      const job = await createJob(step.id, body);
      trackJobInLab(job);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const cancelStep = async (step: PipelineStepState) => {
    if (!step.job_id) return;
    setBusyId(step.id);
    try {
      await cancelJob(step.job_id);
      setOptimisticPlan(null);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const cancelWizardPlan = async () => {
    const jobId = activePlan?.job_id;
    if (!jobId) return;
    setBusyId("__plan__");
    try {
      await cancelJob(jobId);
      setOptimisticPlan(null);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const openArtifact = async (step: PipelineStepState) => {
    const path = step.artifact_path || workspace.projectDir;
    if (!path) return;
    await revealInFileManager(path);
  };

  const exportParams = async () => {
    if (!board?.parameter_exists || !projectId) return;
    if (!isTauri()) {
      setError(t("projects.desktopRequired"));
      return;
    }
    const target = await pickJsonOutputFile(t("pipeline.exportTitle"), board.parameter_filename);
    if (!target) return;
    try {
      const doc = await fetchProjectParameters(projectId);
      await writeTextFileAbsolute(target, doc.text.endsWith("\n") ? doc.text : `${doc.text}\n`);
      notifySaved(t("projects.studio.params.exported", { path: target }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const manualHintStepId = (() => {
    if (!board || wizardPlanActive) return null;
    const withJobError = board.steps.find(
      (s) => s.status === "error" && typeof s.error === "string" && s.error.trim(),
    );
    if (withJobError) return withJobError.id;
    const withReason = board.steps.find(
      (s) =>
        (s.status === "blocked" || s.status === "stale" || s.status === "error") &&
        isPipelineReasonId(s.reason),
    );
    if (!withReason?.reason || !isPipelineReasonId(withReason.reason)) return null;
    return hintStepForPipelineReason(withReason.reason, withReason.id);
  })();

  // Do not mount the wizard until the board has loaded — otherwise a deep-link
  // races past an existing active_plan while board === null. If the board fetch
  // failed, fall through to the board UI (fail-closed) instead of opening wizard.
  if (
    view === "wizard" &&
    params.get("scenario") !== "hpsearch" &&
    !annotationsBlockTrain
  ) {
    if (projectId && board === null) {
      if (loading || !error) {
        return (
          <div className="pp-page">
            <div className="studio-panel pp-work-panel">
              <p className="pp-empty">{t("common.loading")}</p>
            </div>
          </div>
        );
      }
      // error + no board → stay on board chrome below
    } else if (!wizardPlanActive) {
      const scenarioRaw = params.get("scenario");
      const initialScenario =
        scenarioRaw === "finetune" || scenarioRaw === "from_scratch"
          ? scenarioRaw
          : undefined;
      const initialBaseModel = params.get("base");
      return (
        <TrainWizard
          initialScenario={initialScenario}
          initialBaseModel={initialBaseModel}
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
              void load(true);
            }
          }}
        />
      );
    }
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
              aria-selected={view === "monitor"}
              onClick={() => setView("monitor")}
            >
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
              disabled={!projectId}
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
        {wizardPlanActive ? (
          <div className="pp-plan-banner" role="status">
            <div className="pp-plan-banner-text">
              <p className="pp-plan-banner-title">{t("pipeline.planBusyTitle")}</p>
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
                disabled={busyId === "__plan__"}
                onClick={() => void cancelWizardPlan()}
              >
                {t("pipeline.planCancel")}
              </button>
            ) : null}
          </div>
        ) : null}
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
                <div className="pp-left-pane">
                  <h2 className="pp-card-kicker">{t("pipeline.readiness")}</h2>
                  <ReadinessRow
                    state={board.readiness.recordings.state}
                    title={t("pipeline.ready.table")}
                    sub={t("pipeline.ready.tableSub", { count: board.readiness.recordings.rows })}
                  />
                  <ReadinessRow
                    state={board.readiness.annotations.state}
                    title={t("pipeline.ready.annotations")}
                    sub={t("pipeline.ready.annotationsSub", {
                      annotated: board.readiness.annotations.annotated,
                      total: board.readiness.annotations.total,
                    })}
                  />
                  <ReadinessRow
                    state={board.readiness.unlabeled.state}
                    title={t("pipeline.ready.unlabeled")}
                    sub={t("pipeline.ready.unlabeledSub", { count: board.readiness.unlabeled.count })}
                  />
                  <ReadinessRow
                    state={board.readiness.classes.state}
                    title={t("pipeline.ready.classes")}
                    sub={t("pipeline.ready.classesSub", { count: board.readiness.classes.found })}
                  />
                  <ReadinessRow
                    state={board.readiness.snippets.state}
                    title={t("pipeline.ready.snippets")}
                    sub={t("pipeline.ready.snippetsSub", {
                      actual: board.readiness.snippets.actual ?? "—",
                      required: board.readiness.snippets.required,
                      nBatch: board.readiness.snippets.n_batch,
                      batch: board.readiness.snippets.batch_size,
                      split: board.readiness.snippets.split ?? "train",
                    })}
                  />
                  <ReadinessRow
                    state={board.readiness.disk.state}
                    title={t("pipeline.ready.disk")}
                    sub={
                      (board.readiness.disk.needed_bytes ?? 0) > 0
                        ? t("pipeline.ready.diskSub", {
                            free: formatBytesLocalized(
                              board.readiness.disk.free_bytes,
                              locale,
                            ),
                            needed: formatBytesLocalized(
                              board.readiness.disk.needed_bytes,
                              locale,
                            ),
                          })
                        : t("pipeline.ready.diskSubReady", {
                            free: formatBytesLocalized(
                              board.readiness.disk.free_bytes,
                              locale,
                            ),
                          })
                    }
                  />
                  <ReadinessRow
                    state={board.readiness.accelerator.state}
                    title={t("pipeline.ready.accel")}
                    sub={accelSubtitle(t, board.readiness.accelerator)}
                  />
                </div>
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
              <div className="pp-col-head">
                <h2>{t("pipeline.board")}</h2>
                <span className="pp-col-note">{t("pipeline.boardNote")}</span>
              </div>
              <div className="pp-steps">
                {board.steps
                  .slice()
                  .sort(
                    (a, b) =>
                      (TRAIN_PIPELINE_STEP_IDS as readonly string[]).indexOf(a.id) -
                      (TRAIN_PIPELINE_STEP_IDS as readonly string[]).indexOf(b.id),
                  )
                  .map((step) => {
                    const hintHere = manualHintStepId === step.id;
                    const hpsearchOutsidePlan =
                      step.id === "hpsearch" && hpsearchBlockedByPlan;
                    return (
                  <article
                    key={step.id}
                    className={clsx(
                      "pp-step",
                      hintHere && "pp-step--hint",
                      hpsearchOutsidePlan && "pp-step--outside-plan",
                    )}
                    data-status={step.status}
                  >
                    <div className="pp-step-num">{step.order}</div>
                    <div className="min-w-0">
                      <div className="pp-step-title">{t(`pipeline.steps.${step.id}`)}</div>
                      <div className="pp-step-cmd">
                        {step.command}
                        {step.optional ? ` · ${t("pipeline.optional")}` : ""}
                      </div>
                    </div>
                    <div className="pp-step-meta">
                      <div className="pp-step-meta-primary">{stepMetaPrimary(step, t, locale)}</div>
                      {formatPipelineStamp(step.updated_at) !== "—" || step.status === "idle" ? (
                        <div className="pp-step-meta-stamp">{formatPipelineStamp(step.updated_at)}</div>
                      ) : null}
                    </div>
                    <div className="pp-step-status">
                      <PipelineStatusPill status={step.status} />
                    </div>
                    <div className="pp-step-actions">
                      {step.status === "running" || step.status === "queued" ? (
                        <button
                          type="button"
                          className="pp-btn"
                          disabled={busyId === step.id}
                          onClick={() => void cancelStep(step)}
                        >
                          {t("pipeline.cancel")}
                        </button>
                      ) : step.status === "done" ? (
                        <>
                          <button type="button" className="pp-btn" onClick={() => void openArtifact(step)}>
                            {t("pipeline.open")}
                          </button>
                          <div className="pp-more">
                            <button
                              type="button"
                              className={clsx("pp-btn", hintHere && "pp-btn--hint")}
                              aria-expanded={moreId === step.id}
                              disabled={wizardPlanActive || !step.can_run}
                              title={hintHere ? t("pipeline.runHint") : undefined}
                              onClick={() => setMoreId(moreId === step.id ? null : step.id)}
                            >
                              {t("pipeline.more")}
                            </button>
                            {moreId === step.id && !wizardPlanActive ? (
                              <div className="pp-more-menu">
                                <button
                                  type="button"
                                  className={clsx(hintHere && "pp-btn--hint")}
                                  disabled={!engineReady || !step.can_run}
                                  onClick={() => void runStep(step, true)}
                                >
                                  {t("pipeline.rerun")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : hpsearchOutsidePlan ? (
                        <span
                          className="pp-step-waiting pp-step-outside"
                          title={t("pipeline.hpsearchOutsidePlanHint")}
                        >
                          {t("pipeline.hpsearchOutsidePlan")}
                        </span>
                      ) : wizardPlanActive ? (
                        <span className="pp-step-waiting">{t("pipeline.planWaiting")}</span>
                      ) : (
                        <button
                          type="button"
                          className={clsx("pp-btn", hintHere && "pp-btn--hint")}
                          disabled={!engineReady || !step.can_run || busyId === step.id}
                          title={hintHere ? t("pipeline.runHint") : undefined}
                          onClick={() => void runStep(step, step.status === "stale")}
                        >
                          {t("pipeline.run")}
                        </button>
                      )}
                    </div>
                  </article>
                    );
                  })}
              </div>
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
        onSaved={() => void load(true)}
      />
      <TrainMonitor open={view === "monitor"} onClose={() => setView("board")} />
    </div>
  );
}

function accelSubtitle(
  t: (key: string, opts?: Record<string, unknown>) => string,
  accel: ProjectPipeline["readiness"]["accelerator"],
): string {
  const active = String(accel.active_compute_device || "").toLowerCase();
  // Blue subtitle only for an active GPU session — not probe gpu_available alone.
  const onGpu = active === "gpu";
  if (!onGpu) return t("pipeline.ready.accelCpu");
  const backend = String(accel.backend || accel.hint || "").toLowerCase();
  if (backend.includes("metal")) return t("pipeline.ready.accelMetal");
  if (backend.includes("cuda")) return t("pipeline.ready.accelCuda");
  return t("pipeline.ready.accelGpu", {
    backend: accel.backend || accel.hint || "GPU",
  });
}

function ReadinessRow({
  state,
  title,
  sub,
}: {
  state: PipelineReadinessLamp;
  title: string;
  sub: string;
}) {
  return (
    <div className="pp-ready-row">
      <JewelLamp tone={readinessLampTone(state)} />
      <div>
        <div className="pp-ready-title">{title}</div>
        <div className="pp-ready-sub">{sub}</div>
      </div>
    </div>
  );
}