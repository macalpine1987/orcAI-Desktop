import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  fetchProjectPipeline,
  fetchProjectTrainMonitor,
  type PipelineActivePlan,
  type ProjectPipeline,
  type TrainMonitorPhase,
} from "../api/projects";
import {
  isTrainMonitorEntryEnabled,
  isTrainMonitorLive,
} from "../lib/trainMonitorAvailability";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSaveNotice } from "../ui/saveNotice";
import { isAbortError } from "../lib/fetchErrors";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";
import {
  pipelineBlockedWithoutAnnotations,
  wizardPlanBlocksHpsearch,
} from "../lib/trainPipeline";
import {
  hintStepForPipelineReason,
  isPipelineReasonId,
} from "../lib/pipelineReasonExplain";
import {
  clearSnippetsReadiness,
  publishSnippetsReadiness,
} from "../lib/pipelineSnippetsReadiness";
import {
  PROJECT_PARAMETERS_SAVED_EVENT,
  type ProjectParametersSavedDetail,
} from "../lib/projectParametersEvents";
import { pipelineNavInactiveForWorkspace } from "../layout/navigation";
import { openOrFocusTrainMonitorWindow } from "../platform/trainMonitorWindow";
import {
  getCachedPipelineBoard,
  rememberPipelineBoard,
} from "./pipelineBoardCache";
import { usePipelineBoardActions } from "./usePipelineBoardActions";
import { usePipelineBoardPoll } from "./usePipelineBoardPoll";

export function usePipelineBoard() {
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
  const busyIdRef = useRef<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  /** Board-only ``hpsearch -pl`` (multi-GPU); wizard has its own draft flag. */
  const [hpsearchParallel, setHpsearchParallel] = useState(false);
  const [optimisticPlan, setOptimisticPlan] = useState<PipelineActivePlan | null>(
    null,
  );
  const [monitorPhase, setMonitorPhase] = useState<TrainMonitorPhase | null>(null);
  const monitorPhaseRef = useRef<TrainMonitorPhase | null>(null);
  monitorPhaseRef.current = monitorPhase;
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

  const refreshMonitorPhase = useCallback(async () => {
    if (!projectId) {
      setMonitorPhase(null);
      return;
    }
    try {
      const snap = await fetchProjectTrainMonitor(projectId);
      setMonitorPhase(snap.phase);
    } catch (err) {
      if (isAbortError(err)) return;
      /* Keep the last known phase; board still drives most enable cases.
         Surface a soft banner only when phase was never loaded. */
      if (monitorPhaseRef.current == null) {
        setError(
          formatUserFacingErrorRequired(err, t, {
            locale,
            preferPipeline: true,
          }),
        );
      }
    }
  }, [projectId, t, locale]);

  const load = useCallback(
    async (silent = false, fresh = false) => {
      if (!projectId) {
        setBoard(null);
        setMonitorPhase(null);
        clearSnippetsReadiness();
        return;
      }
      const cached = getCachedPipelineBoard(projectId);
      if (cached) {
        setBoard(cached);
        publishSnippetsReadiness(cached.readiness.snippets);
      }
      const quiet = silent || cached != null;
      if (!quiet) setLoading(true);
      try {
        const data = await fetchProjectPipeline(
          projectId,
          fresh ? { fresh: true } : undefined,
        );
        rememberPipelineBoard(projectId, data);
        setBoard(data);
        publishSnippetsReadiness(data.readiness.snippets);
        setError(null);
        void refreshMonitorPhase();
      } catch (err) {
        if (isAbortError(err)) return;
        setError(
          formatUserFacingErrorRequired(err, t, {
            locale,
            preferPipeline: true,
          }),
        );
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [projectId, refreshMonitorPhase, t, locale],
  );

  const refreshBoard = useCallback(async () => {
    if (!projectId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await fetchProjectPipeline(projectId, { fresh: true });
      rememberPipelineBoard(projectId, data);
      setBoard(data);
      publishSnippetsReadiness(data.readiness.snippets);
      flashNotice(t("pipeline.refreshed"));
    } catch (err) {
      if (!isAbortError(err)) {
        setError(
          formatUserFacingErrorRequired(err, t, {
            locale,
            preferPipeline: true,
          }),
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [projectId, refreshing, flashNotice, t, locale]);

  useEffect(() => {
    void load();
    return () => clearSnippetsReadiness();
  }, [load]);

  useEffect(() => {
    if (!projectId) return;
    const onSaved = (ev: Event) => {
      const detail = (ev as CustomEvent<ProjectParametersSavedDetail>).detail;
      if (detail?.projectId !== projectId) return;
      void load(true, true);
    };
    window.addEventListener(PROJECT_PARAMETERS_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(PROJECT_PARAMETERS_SAVED_EVENT, onSaved);
  }, [load, projectId]);

  useEffect(() => {
    setParamsOpen(false);
    setNotice(null);
    setOptimisticPlan(null);
    setMonitorPhase(null);
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
  const monitorAvailable = isTrainMonitorEntryEnabled({
    phase: monitorPhase,
    steps: board?.steps,
  });
  const monitorLive = isTrainMonitorLive({
    phase: monitorPhase,
    steps: board?.steps,
  });

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

  usePipelineBoardPoll({
    projectId,
    pipelineBusy,
    wizardPlanActive,
    load,
  });

  const openMonitorWindow = useCallback(() => {
    void openOrFocusTrainMonitorWindow({ projectId }).catch((err) => {
      setError(
        formatUserFacingErrorRequired(err, t, {
          locale,
          preferPipeline: true,
        }),
      );
    });
  }, [projectId, t, locale]);

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

  // Deep-link ?view=monitor → detached window (then clear the query).
  useEffect(() => {
    if (!board || view !== "monitor") return;
    if (!monitorAvailable) {
      setView("board");
      return;
    }
    openMonitorWindow();
    setView("board");
  }, [board, view, monitorAvailable, openMonitorWindow]);

  const {
    beginStepBusy,
    endStepBusy,
    runStep,
    cancelStep,
    cancelWizardPlan,
    openArtifact,
    exportParams,
  } = usePipelineBoardActions({
    t,
    locale,
    projectId,
    projectDir: workspace.projectDir,
    engineReady,
    wizardPlanActive,
    hpsearchBlockedByPlan,
    hpsearchParallel,
    board,
    activePlan,
    busyIdRef,
    setBusyId,
    setError,
    setMoreId,
    setOptimisticPlan,
    trackJobInLab,
    load,
    notifySaved,
  });

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

  const scenarioRaw = params.get("scenario");
  const wizardInitialScenario: "from_scratch" | "finetune" | undefined =
    scenarioRaw === "finetune" || scenarioRaw === "from_scratch"
      ? scenarioRaw
      : undefined;
  const wizardInitialBaseModel = params.get("base");
  /** Wait for board before mounting wizard (deep-link vs active_plan race). */
  const wizardAwaitingBoard =
    view === "wizard" &&
    scenarioRaw !== "hpsearch" &&
    !annotationsBlockTrain &&
    Boolean(projectId) &&
    board === null &&
    (loading || !error);
  const showTrainWizard =
    view === "wizard" &&
    scenarioRaw !== "hpsearch" &&
    !annotationsBlockTrain &&
    !wizardAwaitingBoard &&
    !(projectId && board === null && error) &&
    !wizardPlanActive;

  return {
    params,
    view,
    workspace,
    navigate,
    trackJobInLab,
    projectId,
    locale,
    board,
    loading,
    refreshing,
    error,
    notice,
    busyId,
    busyIdRef,
    moreId,
    setMoreId,
    paramsOpen,
    setParamsOpen,
    hpsearchParallel,
    setHpsearchParallel,
    optimisticPlan,
    monitorPhase,
    noticeTimer,
    flashNotice,
    refreshMonitorPhase,
    load,
    refreshBoard,
    pipelineBusy,
    activePlan,
    wizardPlanActive,
    annotationsBlockTrain,
    hpsearchBlockedByPlan,
    monitorAvailable,
    monitorLive,
    openMonitorWindow,
    setView,
    setOptimisticPlan,
    beginStepBusy,
    endStepBusy,
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
    i18n,
    notifySaved,
    engineReady,
  };
}
