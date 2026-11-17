import i18n from "../i18n";
import { isAbortError } from "./fetchErrors";
import {
  classifyPipelineError,
  pipelineErrorCopy,
  resolveErrorLang,
} from "./pipelineErrorExplain";

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNetworkish(msg: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed|econnrefused|enotfound|timed?\s*out|socket hang up/i.test(
    msg,
  );
}

/** Stable English / sidecar strings → i18n keys (Home runtime, Jobs). */
const KNOWN_ERROR_KEYS: Array<[RegExp, string]> = [
  [/^Operation timed out$/i, "home.runtimeOperationTimedOut"],
  [/^Start the sidecar first\.?$/i, "home.runtimeStartSidecarFirst"],
  [/^Engine error$/i, "home.runtimeEngineStage.error"],
  [/^Sidecar process exited(?:\s*\([^)]*\))?\.?$/i, "jobs.sidecarProcessExited"],
];

/** Cap huge FastAPI/traceback dumps so the banner stays readable. */
export function truncateUserError(msg: string, max = 280): string {
  const trimmed = msg.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Map thrown values to a short user-facing string.
 * Prefer i18n for transport failures; use pipeline classifiers when helpful.
 */
export function formatUserFacingError(
  err: unknown,
  t: Translate,
  opts?: { locale?: string; preferPipeline?: boolean },
): string | null {
  if (isAbortError(err)) return null;
  const raw = errorText(err);
  if (!raw.trim()) {
    return t("common.requestFailed", {
      defaultValue: t("common.loadFailed", { defaultValue: "Request failed" }),
    });
  }
  for (const [re, key] of KNOWN_ERROR_KEYS) {
    if (re.test(raw.trim())) {
      return t(key, { defaultValue: raw.trim() });
    }
  }
  if (isNetworkish(raw)) {
    return t("common.networkError", {
      defaultValue: t("shellMeta.sidecarOffline"),
    });
  }
  if (opts?.preferPipeline) {
    const kind = classifyPipelineError(raw);
    if (kind !== "generic") {
      const copy = pipelineErrorCopy(kind, resolveErrorLang(opts.locale));
      return t(`pipeline.errors.${kind}.title`, { defaultValue: copy.title });
    }
  }
  return truncateUserError(raw);
}

/** Like formatUserFacingError but always returns a non-empty string. */
export function formatUserFacingErrorRequired(
  err: unknown,
  t: Translate,
  opts?: { locale?: string; preferPipeline?: boolean },
): string {
  return (
    formatUserFacingError(err, t, opts) ??
    t("common.requestFailed", { defaultValue: "Request failed" })
  );
}

/** For modules without a React ``t`` (SidecarContext, JobsListContext). */
export function formatUserFacingErrorI18n(
  err: unknown,
  opts?: { locale?: string; preferPipeline?: boolean },
): string {
  return formatUserFacingErrorRequired(
    err,
    (key, o) => i18n.t(key, o as Record<string, unknown>),
    opts,
  );
}
