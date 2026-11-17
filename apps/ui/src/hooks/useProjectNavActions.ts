import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { TFunction } from "i18next";
import {
  fetchProjectRecordings,
  fetchProjectRecordingTable,
  updateProject,
  type ProjectRecord,
  type ProjectRecordingTable,
  type ProjectSummary,
} from "../api/projects";
import { formatProjectError } from "../lib/projectErrors";
import {
  trainWizardBlockedByAnnotations,
  type NextStep,
} from "../lib/projectsStudio";
import {
  recordingTableSyncModeAfterAdd,
  type RecordingTableSyncMode,
} from "../lib/recordingTableSync";
import {
  applyPredictHintsToQueue,
  buildPredictQueue,
  syncQueueWithProjectRecordings,
} from "../workspace/predictQueue";
import { applyActiveProject } from "../workspace/project";
import { usePredictSessionOptional } from "../predict/PredictSessionContext";

type Args = {
  t: TFunction;
  detail: ProjectRecord | null;
  summary: ProjectSummary | null;
  table: ProjectRecordingTable | null;
  selectedRows: Set<string>;
  engineReady: boolean;
  workspaceActiveProjectId: string | null;
  predictBlocked: boolean;
  tableNeedsRefresh: boolean;
  beginBusy: () => boolean;
  endBusy: () => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setDetail: Dispatch<SetStateAction<ProjectRecord | null>>;
  refreshSummary: () => Promise<void>;
  runTableSync: (projectId: string, mode: RecordingTableSyncMode) => Promise<void>;
  setRefreshOpen: (open: boolean) => void;
  setTab: (tab: "recordings" | "annotations" | "artifacts" | "parameters") => void;
  navigate: NavigateFunction;
};

/** Predict / training / next-step navigation and auto-sync CSV toggle. */
export function useProjectNavActions(args: Args) {
  const {
    t,
    detail,
    summary,
    table,
    selectedRows,
    engineReady,
    workspaceActiveProjectId,
    predictBlocked,
    tableNeedsRefresh,
    beginBusy,
    endBusy,
    setError,
    setDetail,
    refreshSummary,
    runTableSync,
    setRefreshOpen,
    setTab,
    navigate,
  } = args;

  const predictSession = usePredictSessionOptional();

  const onToggleAutoSyncCsv = async (enabled: boolean) => {
    if (!detail) return;
    if (!beginBusy()) return;
    setError(null);
    try {
      const project = await updateProject(detail.id, {
        auto_sync_recording_table: enabled,
      });
      setDetail(project);
      if (project.id === workspaceActiveProjectId) applyActiveProject(project);
      await refreshSummary();
      if (enabled && engineReady && tableNeedsRefresh) {
        await runTableSync(project.id, recordingTableSyncModeAfterAdd(project));
      }
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const openPredict = async (tabNav: "run" | "filter") => {
    if (!detail) return;
    if (tabNav === "run" && predictBlocked) {
      setError(t("projects.studio.table.predictBlockedStale"));
      return;
    }
    if (!beginBusy()) return;
    setError(null);
    try {
      const recordings = await fetchProjectRecordings(detail.id);
      if (recordings.length === 0) {
        if (tabNav === "filter") {
          applyActiveProject(detail);
          predictSession?.hydrateFromProject({ project: detail });
          navigate("/predict", { state: { tab: "filter" } });
          return;
        }
        setError(t("projects.openInPredictNeedWavs"));
        return;
      }
      const queue =
        tabNav === "run" && selectedRows.size > 0
          ? buildPredictQueue(detail, recordings, selectedRows)
          : syncQueueWithProjectRecordings(detail, recordings, null);
      if (!queue) {
        if (tabNav === "filter") {
          applyActiveProject(detail);
          predictSession?.hydrateFromProject({ project: detail });
          navigate("/predict", { state: { tab: "filter" } });
          return;
        }
        setError(t("projects.openInPredictNeedWavs"));
        return;
      }
      const tableForHints =
        table ?? (await fetchProjectRecordingTable(detail.id));
      const withHints = applyPredictHintsToQueue(
        queue,
        tableForHints.rows.map((row) => ({
          recording: row.recording,
          predict_status: row.predict_status,
          predicted_path: row.predicted_path,
        })),
      );
      applyActiveProject(detail);
      predictSession?.hydrateFromProject({
        project: detail,
        queue: withHints,
      });
      navigate("/predict", { state: { tab: tabNav } });
    } catch (err) {
      setError(formatProjectError(err, t));
    } finally {
      endBusy();
    }
  };

  const onPredict = () => void openPredict("run");

  const trainWizardBlocked = trainWizardBlockedByAnnotations(summary);

  const onOpenTraining = () => {
    if (!detail || trainWizardBlocked) return;
    applyActiveProject(detail);
    navigate("/pipeline");
  };

  const onNextStep = (step: NextStep) => {
    if (!detail) return;
    applyActiveProject(detail);
    if (step.action === "sync_table") {
      setRefreshOpen(true);
      return;
    }
    if (step.action === "annotate") {
      setTab("annotations");
      return;
    }
    if (step.action === "predict") {
      if (predictBlocked) {
        setError(t("projects.studio.table.predictBlockedStale"));
        return;
      }
      void openPredict("run");
      return;
    }
    if (step.action === "filter") {
      void openPredict("filter");
      return;
    }
    if (
      (step.action === "train" || step.action === "create_tvt") &&
      trainWizardBlocked
    ) {
      return;
    }
    navigate(step.route, step.routeState ? { state: step.routeState } : undefined);
  };

  return {
    onToggleAutoSyncCsv,
    openPredict,
    onPredict,
    trainWizardBlocked,
    onOpenTraining,
    onNextStep,
  };
}
