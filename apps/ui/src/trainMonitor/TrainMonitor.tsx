import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { cancelJob, fetchJob, fetchJobLogSince } from "../api/jobs";
import {
  fetchProjectTrainMonitor,
  type TrainMonitorSnapshot,
} from "../api/projects";
import { ModalCloseButton } from "../components/ModalCloseButton";
import { PageHelpButton } from "../components/PageHelpButton";
import { PipelineErrorAlert } from "../components/PipelineErrorAlert";
import { IconFolder } from "../components/projects/ProjectsIcons";
import { useJobsListContext } from "../jobs/JobsListContext";
import { useLabJobOptional } from "../lab/LabJobContext";
import { useWorkspace } from "../hooks/useWorkspace";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { isAbortError } from "../lib/fetchErrors";
import {
  estimateRemainingSec,
  liveElapsedSec,
} from "../lib/trainMonitorClock";
import { formatBytesLocalized } from "../lib/trainPipeline";
import { revealInFileManager } from "../platform/shell";
import {
  historySeries,
  MetricChart,
  trainMetricKey,
} from "./MetricChart";

type Props = {
  open: boolean;
  onClose: () => void;
};

const POLL_BUSY_MS = 1000;
const POLL_IDLE_MS = 3000;
const CLOCK_TICK_MS = 1000;

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatMetric(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function formatLr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const exp = value.toExponential(0).toLowerCase();
  const m = /^(-?\d+(?:\.\d+)?)e([+-]?)(\d+)$/.exec(exp);
  if (!m) return exp;
  const sign = m[2] === "-" ? "-" : m[2] === "+" ? "+" : "";
  return `${m[1]}e${sign}${m[3]!.padStart(2, "0")}`;
}

export function TrainMonitor({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const workspace = useWorkspace();
  const projectId = workspace.activeProjectId;
  const lab = useLabJobOptional();
  const { refresh: refreshJobs, upsertJob } = useJobsListContext();
  const locale = i18n.language || "en";
  const isRu = (i18n.language || "en").toLowerCase().startsWith("ru");

  const [snap, setSnap] = useState<TrainMonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logOffsetRef = useRef(0);
  const stopJobIdRef = useRef<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!projectId) {
        setSnap(null);
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
        if (isAbortError(err)) return;
        if (!silent) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [projectId, upsertJob, lab],
  );

  useEffect(() => {
    if (!open) {
      stopJobIdRef.current = null;
      setSnap(null);
      setError(null);
      setLogLines([]);
      logOffsetRef.current = 0;
      return;
    }
    void load();
  }, [open, load]);

  const busy = snap?.phase === "running" || snap?.phase === "queued";
  useEffect(() => {
    if (!open || !projectId) return;
    const ms = busy ? POLL_BUSY_MS : POLL_IDLE_MS;
    const id = window.setInterval(() => void load(true), ms);
    return () => window.clearInterval(id);
  }, [open, projectId, busy, load]);

  // Smooth wall-clock for elapsed / ETA between sidecar flushes.
  useEffect(() => {
    if (!open || !busy) return;
    const id = window.setInterval(() => setNowSec(Date.now() / 1000), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, [open, busy]);

  // Tail job log into the monitor (console shows real train output).
  useEffect(() => {
    logOffsetRef.current = 0;
    setLogLines([]);
  }, [snap?.job_id]);

  useEffect(() => {
    if (!open || !snap?.job_id) return;
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
      } catch {
        /* ignore log gaps */
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), busy ? 1500 : 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, snap?.job_id, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
    // Only show when history has not yet absorbed this epoch's train metric.
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
          setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!open) return null;

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

  return (
    <PredictAppModalPortal>
      <div
        className={PREDICT_APP_MODAL_OVERLAY_CLASS}
        role="presentation"
        onClick={() => {
          onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="tm-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tm-header">
            <div className="tm-header-main min-w-0">
              <h2 id={titleId} className="tm-title">
                {t("monitor.title")}
              </h2>
              <p className="tm-subtitle">{t("monitor.subtitle")}</p>
            </div>
            <div className="tm-header-actions">
              <PageHelpButton topic="train.monitor" hint={t("help.hint.train")} />
              <ModalCloseButton
                aria-label={t("common.close")}
                title={t("common.close")}
                onClick={onClose}
              />
            </div>
          </div>

          {jobError ? (
            <PipelineErrorAlert raw={jobError} stepId="train" />
          ) : null}

          {!projectId ? (
            <p className="pp-empty tm-pad">
              {t("pipeline.noProject")}{" "}
              <Link to="/projects" className="underline" onClick={onClose}>
                {t("nav.projects")}
              </Link>
            </p>
          ) : (
            <div className="tm-body">
              <div className="tm-kpi-row">
                <div className="tm-kpi">
                  <span className="tm-kpi-label">{t("monitor.kpi.epoch")}</span>
                  <span className="tm-kpi-value">
                    {snap ? `${snap.epoch}/${snap.epochs}` : "—"}
                  </span>
                </div>
                <div className="tm-kpi">
                  <span className="tm-kpi-label">
                    {snap?.monitor?.toUpperCase() || "VAL_MBA"}
                  </span>
                  <span className="tm-kpi-value tm-kpi-value--accent">
                    {formatMetric(monitorMetricValue)}
                  </span>
                </div>
                <div className="tm-kpi">
                  <span className="tm-kpi-label">{t("monitor.kpi.loss")}</span>
                  <span className="tm-kpi-value">
                    {formatMetric(snap?.metrics.loss)}
                  </span>
                </div>
                <div className="tm-kpi">
                  <span className="tm-kpi-label">{t("monitor.kpi.lr")}</span>
                  <span className="tm-kpi-value">
                    {formatLr(snap?.metrics.learning_rate)}
                  </span>
                </div>
                <div className="tm-kpi">
                  <span className="tm-kpi-label">{t("monitor.kpi.elapsed")}</span>
                  <span className="tm-kpi-value">
                    {formatDuration(elapsedLive)}
                  </span>
                </div>
                <div className="tm-kpi">
                  <span className="tm-kpi-label">{t("monitor.kpi.remaining")}</span>
                  <span className="tm-kpi-value">
                    {trainingStopped
                      ? "—"
                      : remainingLive != null
                        ? remainingLive <= 0 && !busy
                          ? "0:00"
                          : `≈${formatDuration(remainingLive)}`
                        : "—"}
                  </span>
                </div>
              </div>

              <div className="tm-batch-card">
                <div className="tm-batch-meta">
                  <span>
                    {t("monitor.batchLine", {
                      epoch: snap?.epoch ?? 0,
                      batch: snap?.batch ?? 0,
                      batches: snap?.batches ?? "—",
                    })}
                  </span>
                  <span
                    className={
                      trainingDone
                        ? "tm-batch-done"
                        : trainingStopped
                          ? "tm-batch-stopped"
                          : "tm-batch-pct"
                    }
                    role={trainingDone || trainingStopped ? "status" : undefined}
                  >
                    {trainingDone
                      ? t("monitor.done")
                      : trainingStopped
                        ? t("monitor.stopped")
                        : batchPct != null
                          ? `${batchPct}%`
                          : "—"}
                  </span>
                </div>
                <div
                  className={clsx(
                    "tm-batch-track",
                    snap?.phase === "running" &&
                      batchPct == null &&
                      "progress-track--indeterminate",
                  )}
                >
                  <div
                    className={clsx(
                      "tm-batch-fill",
                      trainingDone && "is-done",
                      !trainingDone &&
                        snap?.phase === "running" &&
                        batchPct == null &&
                        "progress-fill--indeterminate",
                    )}
                    style={
                      trainingDone
                        ? { width: "100%" }
                        : batchPct != null
                          ? { width: `${batchPct}%` }
                          : snap?.phase === "running"
                            ? undefined
                            : { width: "0%" }
                    }
                  />
                </div>
              </div>

              <div className="tm-mid">
                <section className="tm-chart-card">
                  <MetricChart
                    train={trainSeries}
                    val={valSeries}
                    best={snap?.best_value ?? null}
                    bestEpoch={snap?.best_epoch ?? null}
                    monitor={snap?.monitor || "val_MBA"}
                    trainLabel={trainLabel}
                    provisionalTrain={provisionalTrain}
                    liveEpoch={snap?.phase === "running" ? snap.epoch : null}
                  />
                </section>
                <aside className="tm-status-card">
                  <h3 className="tm-card-kicker">{t("monitor.statusTitle")}</h3>
                  <dl className="tm-status-dl">
                    <div>
                      <dt>{t("monitor.status.model")}</dt>
                      <dd>{snap?.model_name ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("monitor.status.checkpoint")}</dt>
                      <dd>
                        {snap?.checkpoint.exists
                          ? isRu
                            ? `лучшая эпоха ${snap.best_epoch ?? "—"} · ${formatBytesLocalized(
                                snap.checkpoint.size_bytes,
                                locale,
                              )}`
                            : `best epoch ${snap.best_epoch ?? "—"} · ${formatBytesLocalized(
                                snap.checkpoint.size_bytes,
                                locale,
                              )}`
                          : t("monitor.status.checkpointNone")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("monitor.status.earlyStop")}</dt>
                      <dd>
                        {isRu
                          ? `${snap?.early_stopping.epochs_since_best ?? 0} из ${snap?.early_stopping.patience ?? 0} без улучшения`
                          : `${snap?.early_stopping.epochs_since_best ?? 0} of ${snap?.early_stopping.patience ?? 0} without improvement`}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("monitor.status.reduceLr")}</dt>
                      <dd>
                        {snap?.reduce_lr.in_epochs == null
                          ? "—"
                          : snap.reduce_lr.in_epochs <= 0
                            ? isRu
                              ? "снижение при следующем плато"
                              : "due on next plateau"
                            : isRu
                              ? `ещё ${snap.reduce_lr.in_epochs} без улучшения`
                              : `${snap.reduce_lr.in_epochs} more without improvement`}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("monitor.status.dataset")}</dt>
                      <dd>
                        {snap
                          ? `${snap.dataset.compression} · ${snap.dataset.accelerator}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <p className="tm-status-hint">{t("monitor.stopHint")}</p>
                  <div className="tm-status-actions">
                    <button
                      type="button"
                      className="tm-btn tm-btn-stop"
                      disabled={!snap?.can_stop}
                      onClick={stopTrain}
                    >
                      {t("monitor.stop")}
                    </button>
                    <button
                      type="button"
                      className="tm-btn tm-btn-folder"
                      disabled={!snap?.can_open_folder}
                      onClick={() => void openFolder()}
                    >
                      <IconFolder size={14} />
                      {t("monitor.openFolder")}
                    </button>
                  </div>
                </aside>
              </div>

              <section className="tm-log-card" aria-label={isRu ? "Лог обучения" : "Training log"}>
                <h3 className="tm-card-kicker">
                  {isRu ? "Лог обучения" : "Training log"}
                </h3>
                <pre className="tm-log-pre">
                  {logLines.length
                    ? logLines.join("\n")
                    : isRu
                      ? "Ожидание вывода train…"
                      : "Waiting for train output…"}
                </pre>
              </section>
            </div>
          )}
        </div>
      </div>
    </PredictAppModalPortal>
  );
}
