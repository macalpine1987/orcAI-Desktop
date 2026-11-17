import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { PipelineReadinessLamp, PipelineStepState } from "../api/projects";
import {
  classifyPipelineError,
  pipelineErrorCopy,
  resolveErrorLang,
} from "./pipelineErrorExplain";
import {
  artifactCountKey,
  formatBytesLocalized,
} from "./trainPipeline";

export function readinessLampTone(state: PipelineReadinessLamp): string {
  if (state === "warn") return "is-active";
  if (state === "off") return "is-stopped";
  if (state === "info") return "is-available";
  return "is-ready";
}

export function PipelineStatusPill({
  status,
}: {
  status: PipelineStepState["status"];
}) {
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

export function JewelLamp({ tone }: { tone: string }) {
  return (
    <span className={clsx("runtime-row-lamp", tone)} aria-hidden>
      <span className="runtime-row-lamp-well">
        <span className="runtime-row-lamp-jewel" />
      </span>
    </span>
  );
}

export function stepMetaPrimary(
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
    (step.status === "blocked" ||
      step.status === "stale" ||
      step.status === "error") &&
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
