import type { PipelineReadinessLamp, ProjectPipeline } from "../../api/projects";
import { formatBytesLocalized } from "../../lib/trainPipeline";
import { JewelLamp, readinessLampTone } from "../../lib/pipelineBoardUi";
import { pipelineTableDetailKey } from "../../lib/pipelineTableLamp";

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

export function PipelineReadinessPanel({
  board,
  locale,
  t,
}: {
  board: ProjectPipeline;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="pp-left-pane">
      <h2 className="pp-card-kicker">{t("pipeline.readiness")}</h2>
      <ReadinessRow
        state={board.readiness.recordings.state}
        title={t("pipeline.ready.table")}
        sub={t(pipelineTableDetailKey(
          board.readiness.recordings.sync,
          board.readiness.recordings.state,
        ), { count: board.readiness.recordings.rows })}
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
  );
}
