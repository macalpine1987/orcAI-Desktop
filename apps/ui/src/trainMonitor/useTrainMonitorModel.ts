import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cancelJob, fetchJob, fetchJobLogSince } from "../api/jobs";
import {
  errorText,
  formatUserFacingErrorRequired,
} from "../lib/userFacingError";
import {
  fetchProjectTrainMonitor,
  type TrainMonitorSnapshot,
} from "../api/projects";
import { useJobsListContext } from "../jobs/JobsListContext";
import { useLabJobOptional } from "../lab/LabJobContext";
import { useWorkspace } from "../hooks/useWorkspace";
import { hasRuntimeSidecarBase } from "../api/sidecar";
import { isAbortError } from "../lib/fetchErrors";
import {
  estimateRemainingSec,
  liveElapsedSec,
} from "../lib/trainMonitorClock";
import { revealInFileManager } from "../platform/shell";
import { closeTrainMonitorWindow } from "../platform/trainMonitorWindow";
import { isTauriRuntime } from "../api/sidecarControl";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useNowSec } from "../hooks/useNowSec";
import { silentCatch } from "../lib/silentCatch";
import { useSidecarStatus } from "../sidecar/SidecarContext";
import { historySeries, trainMetricKey } from "./MetricChart";
import {
  TRAIN_MONITOR_LOG_POLL_BUSY_MS,
  TRAIN_MONITOR_LOG_POLL_IDLE_MS,
  TRAIN_MONITOR_POLL_BUSY_MS,
  TRAIN_MONITOR_POLL_IDLE_MS,
} from "../lib/pollIntervals";
import {
  readTrainMonitorCache,
  trainMonitorCacheShouldWrite,
  writeTrainMonitorCache,
} from "./trainMonitorCache";

/** Child window clears then rebinds the sidecar port; first paint must not alert. */
export function isTransientRuntimeBindError(err: unknown): boolean {
  return /Sidecar URL is not bound yet/i.test(errorText(err));
}

/** Snapshot polling, log tail, stop/open-folder, and chart series for TrainMonitor. */
export function useTrainMonitorModel() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useWorkspace();
  const queryProject = searchParams.get("project")?.trim() || null;
  const projectId = queryProject || workspace.activeProjectId;
  const lab = useLabJobOptional();
  const { refresh: refreshJobs, upsertJob } = useJobsListContext();
  const { sidecarPhase } = useSidecarStatus();
  const locale = i18n.language || "en";
  const isRu = (i18n.language || "en").toLowerCase().startsWith("ru");
  const runtimeReady =
    sidecarPhase === "running" && hasRuntimeSidecarBase();

  const bootCache = projectId ? readTrainMonitorCache(projectId) : null;
  const [snap, setSnap] = useState<TrainMonitorSnapshot | null>(
    () => bootCache?.snap ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>(
    () => bootCache?.logLines ?? [],
  );
  const logOffsetRef = useRef(bootCache?.logOffset ?? 0);
  const stopJobIdRef = useRef<string | null>(null);
  const cacheRef = useRef(bootCache);
  const restoredJobIdRef = useRef<string | null>(bootCache?.snap?.job_id ?? null);
  /** Project id that `snap` / `logLines` currently belong to (may lag `projectId` one render). */
  const snapOwnerRef = useRef<string | null>(projectId);
  /** Skip one job_id log wipe after a project switch (stale snap still in this commit). */
  const skipNextJobLogResetRef = useRef(false);

  const persistCache = useCallback(
    (force = false) => {
      const ownerId = snapOwnerRef.current;
      // Never write the previous project's snap under the new projectId.
      if (!ownerId || ownerId !== projectId || !snap) return;
      const entry = {
        snap,
        logLines,
        logOffset: logOffsetRef.current,
      };
      if (
        force ||
        trainMonitorCacheShouldWrite(cacheRef.current, entry)
      ) {
        writeTrainMonitorCache(ownerId, entry);
        cacheRef.current = entry;
      }
    },
    [projectId, snap, logLines],
  );

  const onClose = useCallback(() => {
    persistCache(true);
    void closeTrainMonitorWindow();
  }, [persistCache]);

  const load = useCallback(
    async (silent = false) => {
      if (!projectId) {
        setSnap(null);
        return;
      }
      if (!hasRuntimeSidecarBase()) {
        return;
      }
      try {
        const data = await fetchProjectTrainMonitor(projectId);
        if (stopJobIdRef.current && stopJobIdRef.current === data.job_id) {
          if (data.phase === "running" || data.phase === "queued") {
            return;
          }
          setSnap((prev) =>
            prev
              ? {
                  ...data,
                  epoch: prev.epoch,
                  epochs: prev.epochs,
                  batch: prev.batch,
                  batches: prev.batches,
                  batch_progress: prev.batch_progress,
                  metrics: prev.metrics,
                  history: prev.history,
                  elapsed_sec: prev.elapsed_sec,
                  remaining_sec: null,
                }
              : { ...data, remaining_sec: null },
          );
          setError(null);
          return;
        }
        setSnap(data);
        setError(null);
        if (data.job_id && (data.phase === "running" || data.phase === "queued")) {
          try {
            const job = await fetchJob(data.job_id);
            upsertJob(job);
            lab?.selectJob(job.id);
          } catch {
            /* dock follows active job via list poll */
          }
        }
      } catch (err) {
        if (isAbortError(err) || isTransientRuntimeBindError(err)) return;
        if (!silent) {
          setError(formatUserFacingErrorRequired(err, t));
        }
      }
    },
    [projectId, upsertJob, lab, t],
  );

  useEffect(() => {
    const outgoing = snapOwnerRef.current;
    if (outgoing && outgoing !== projectId && snap) {
      writeTrainMonitorCache(outgoing, {
        snap,
        logLines,
        logOffset: logOffsetRef.current,
      });
    }
    stopJobIdRef.current = null;
    setError(null);
    skipNextJobLogResetRef.current = true;
    const cached = projectId ? readTrainMonitorCache(projectId) : null;
    cacheRef.current = cached;
    restoredJobIdRef.current = cached?.snap?.job_id ?? null;
    snapOwnerRef.current = projectId;
    if (cached?.snap) {
      setSnap(cached.snap);
      setLogLines(cached.logLines);
      logOffsetRef.current = cached.logOffset;
    } else {
      setSnap(null);
      setLogLines([]);
      logOffsetRef.current = 0;
    }
    // Intentionally omit snap/logLines: only flush the pre-switch render's values.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project switch handoff
  }, [projectId]);

  useEffect(() => {
    if (!runtimeReady) return;
    const silent = Boolean(cacheRef.current?.snap);
    void load(silent);
  }, [load, runtimeReady]);

  useEffect(() => {
    persistCache(false);
  }, [persistCache]);

  const busy = snap?.phase === "running" || snap?.phase === "queued";
  const nowSec = useNowSec(busy);
  useEffect(() => {
    if (!projectId || !runtimeReady) return;
    const ms = busy ? TRAIN_MONITOR_POLL_BUSY_MS : TRAIN_MONITOR_POLL_IDLE_MS;
    const id = window.setInterval(() => void load(true), ms);
    return () => window.clearInterval(id);
  }, [projectId, busy, load, runtimeReady]);

  useEffect(() => {
    if (skipNextJobLogResetRef.current) {
      skipNextJobLogResetRef.current = false;
      const jobId = snap?.job_id ?? null;
      if (jobId && jobId === restoredJobIdRef.current) {
        restoredJobIdRef.current = null;
      }
      return;
    }
    const jobId = snap?.job_id ?? null;
    if (jobId && jobId === restoredJobIdRef.current) {
      restoredJobIdRef.current = null;
      return;
    }
    restoredJobIdRef.current = null;
    logOffsetRef.current = 0;
    setLogLines([]);
  }, [snap?.job_id]);

  useEffect(() => {
    if (!snap?.job_id) return;
    let cancelled = false;
    const jobId = snap.job_id;
    const pull = async () => {
      try {
        const chunk = await fetchJobLogSince(jobId, logOffsetRef.current);
        if (cancelled) return;
        if (chunk.lines?.length) {
          setLogLines((prev) => {
            const next = [...prev, ...chunk.lines];
            return next.length > 80 ? next.slice(-80) : next;
          });
        }
        if (typeof chunk.next_since === "number") {
          logOffsetRef.current = chunk.next_since;
        }
      } catch (err) {
        silentCatch("trainMonitorLog")(err);
        /* ignore log gaps */
      }
    };
    void pull();
    const id = window.setInterval(
      () => void pull(),
      busy ? TRAIN_MONITOR_LOG_POLL_BUSY_MS : TRAIN_MONITOR_LOG_POLL_IDLE_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [snap?.job_id, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlistenClose: (() => void) | undefined;
    let unlistenShow: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        unlistenClose = await WebviewWindow.getCurrent().onCloseRequested(
          async (event) => {
            event.preventDefault();
            persistCache(true);
            await closeTrainMonitorWindow();
          },
        );
      } catch (err) {
        silentCatch("trainMonitorClose")(err);
      }
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenShow = await listen<{ projectId?: string | null }>(
          "orcai-train-monitor-show",
          (event) => {
            const nextId = event.payload?.projectId?.trim() || null;
            if (!nextId || nextId === projectId) {
              void load(true);
              return;
            }
            setSearchParams({ project: nextId }, { replace: true });
          },
        );
      } catch (err) {
        silentCatch("trainMonitorShow")(err);
      }
      if (cancelled) {
        unlistenClose?.();
        unlistenShow?.();
      }
    })();
    return () => {
      cancelled = true;
      unlistenClose?.();
      unlistenShow?.();
    };
  }, [load, persistCache, projectId, setSearchParams]);

  const monitorKey = snap?.monitor || "val_MBA";
  const trainKey = trainMetricKey(monitorKey);

  const trainSeries = useMemo(
    () => historySeries(snap?.history, trainKey),
    [snap, trainKey],
  );
  const valSeries = useMemo(() => {
    const primary = historySeries(snap?.history, monitorKey);
    if (primary.length) return primary;
    return historySeries(snap?.history, "val_MBA");
  }, [snap, monitorKey]);

  const provisionalTrain = useMemo(() => {
    if (!snap || snap.phase !== "running") return null;
    const live =
      (snap.metrics as Record<string, number | null>)[trainKey] ??
      snap.metrics.MBA;
    if (live == null || !Number.isFinite(live)) return null;
    if (trainSeries.length >= snap.epoch) return null;
    return live;
  }, [snap, trainSeries.length, trainKey]);

  const trainLabel = useMemo(() => {
    if (trainSeries.length || snap?.metrics.MBA != null) return trainKey;
    const keys = Object.keys(snap?.history || {}).filter(
      (k) => !k.startsWith("val_") && k !== "learning_rate" && k !== "loss",
    );
    return keys[0] || trainKey;
  }, [snap, trainKey, trainSeries.length]);

  const elapsedLive = liveElapsedSec({
    startedAt: snap?.started_at,
    fallbackElapsed: snap?.elapsed_sec,
    running: busy,
    now: nowSec,
  });
  const remainingLive = busy
    ? estimateRemainingSec({
        startedAt: snap?.started_at,
        now: nowSec,
        epoch: snap?.epoch ?? 0,
        epochs: snap?.epochs ?? 1,
        batch: snap?.batch ?? 0,
        batches: snap?.batches,
        earlyStopEpochsLeft: snap?.early_stopping?.remaining ?? null,
      }) ?? snap?.remaining_sec ?? null
    : snap?.remaining_sec ?? null;

  const stopTrain = () => {
    if (!snap?.job_id || !snap.can_stop) return;
    const jobId = snap.job_id;
    stopJobIdRef.current = jobId;
    setError(null);
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            phase: "cancelled",
            can_stop: false,
            job_status: "cancelled",
            remaining_sec: null,
          }
        : prev,
    );
    void (async () => {
      try {
        await cancelJob(jobId);
        await refreshJobs();
      } catch (err) {
        if (stopJobIdRef.current === jobId) {
          stopJobIdRef.current = null;
        }
        if (!isAbortError(err)) {
          setError(formatUserFacingErrorRequired(err, t));
        }
        await load(true);
      }
    })();
  };

  const openFolder = async () => {
    if (!snap?.model_dir) return;
    try {
      await revealInFileManager(snap.model_dir);
    } catch (err) {
      setError(formatUserFacingErrorRequired(err, t));
    }
  };

  const batchPct =
    snap?.batch_progress != null
      ? Math.round(snap.batch_progress * 100)
      : null;
  const trainingDone = snap?.phase === "done";
  const trainingStopped = snap?.phase === "cancelled";

  const jobError =
    snap?.phase === "error"
      ? snap.job_error?.trim() || error || null
      : error;

  const monitorMetricValue =
    snap?.metrics.val_MBA ??
    (snap?.monitor
      ? (snap.metrics as Record<string, number | null>)[snap.monitor]
      : null);

  return {
    t,
    i18n,
    locale,
    isRu,
    projectId,
    snap,
    logLines,
    onClose,
    busy,
    trainSeries,
    valSeries,
    provisionalTrain,
    trainLabel,
    elapsedLive,
    remainingLive,
    stopTrain,
    openFolder,
    batchPct,
    trainingDone,
    trainingStopped,
    jobError,
    monitorMetricValue,
  };
}
