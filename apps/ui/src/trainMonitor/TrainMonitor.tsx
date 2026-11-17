import { useId } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { PageHelpButton } from "../components/PageHelpButton";
import { PipelineErrorAlert } from "../components/PipelineErrorAlert";
import { IconFolder } from "../components/projects/ProjectsIcons";
import { formatBytesLocalized } from "../lib/trainPipeline";
import { isTauriRuntime } from "../api/sidecarControl";
import {
  focusMainShellWindow,
  openHelpInMainShell,
} from "../platform/shellNavigate";
import { MetricChart } from "./MetricChart";
import { TrainMonitorKpiRow } from "./TrainMonitorKpiRow";
import { useTrainMonitorModel } from "./useTrainMonitorModel";

/**
 * Detached training monitor body (own window / `/train-monitor` route).
 * Not a modal — close destroys the monitor window without stopping train.
 */
export function TrainMonitor() {
  const titleId = useId();
  const {
    t,
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
  } = useTrainMonitorModel();

  return (
    <div className="tm-window app-shell-root" role="main" aria-labelledby={titleId}>
      <div className="tm-window-frame">
        <div className="tm-header">
          <div className="tm-header-main min-w-0">
            <h2 id={titleId} className="tm-title">
              {t("monitor.title")}
            </h2>
            <p className="tm-subtitle">{t("monitor.subtitle")}</p>
          </div>
          <div className="tm-header-actions">
            <PageHelpButton
              topic="train.monitor"
              hint={t("help.hint.train")}
              onClick={() => {
                void openHelpInMainShell("train.monitor");
              }}
            />
          </div>
        </div>

        {jobError ? (
          <PipelineErrorAlert raw={jobError} stepId="train" />
        ) : null}

        {!projectId ? (
          <p className="pp-empty tm-pad">
            {t("pipeline.noProject")}{" "}
            {isTauriRuntime() ? (
              <button
                type="button"
                className="underline tm-link-btn"
                onClick={() => {
                  void focusMainShellWindow().then(() => onClose());
                }}
              >
                {t("nav.projects")}
              </button>
            ) : (
              <Link to="/projects" className="underline" onClick={onClose}>
                {t("nav.projects")}
              </Link>
            )}
          </p>
        ) : (
          <div className="tm-body">
            <TrainMonitorKpiRow
              snap={snap}
              monitorMetricValue={monitorMetricValue}
              elapsedLive={elapsedLive}
              remainingLive={remainingLive}
              trainingStopped={trainingStopped}
              busy={busy}
              t={t}
            />

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
  );
}
