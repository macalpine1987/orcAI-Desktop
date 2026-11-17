/** Map raw pipeline/job errors to user-facing explanations. */

export type PipelineErrorKind =
  | "tvt_gzip_corrupt"
  | "cancelled"
  | "oom"
  | "disk_full"
  | "snippets_shortage"
  | "call_weights"
  | "missing_spectrogram"
  | "empty_spectrogram_selection"
  | "missing_labels"
  | "already_exists"
  | "engine_sys_exit"
  | "model_missing"
  | "architecture"
  | "cannot_mask_na"
  | "permission"
  | "not_found"
  | "shape_mismatch"
  | "generic";

export type PipelineErrorTone = "error" | "warn";

export type PipelineErrorCopy = {
  kind: PipelineErrorKind;
  tone: PipelineErrorTone;
  title: string;
  body: string;
  stepsLabel: string;
  steps: string[];
};

export function classifyPipelineError(raw: string | null | undefined): PipelineErrorKind {
  if (!raw) return "generic";
  const s = raw.toLowerCase();

  // TFRecordDataset(GZIP) → zlib inflate failure while iterating batches.
  if (
    s.includes("incorrect header check") ||
    (s.includes("inflate()") && s.includes("iteratorgetnext")) ||
    (s.includes("iteratorgetnext") && s.includes("incorrect header")) ||
    (s.includes("graph execution error") && s.includes("incorrect header check"))
  ) {
    return "tvt_gzip_corrupt";
  }

  if (
    s.includes("cancelled by user") ||
    s.includes("job cancelled") ||
    s === "cancelled"
  ) {
    return "cancelled";
  }

  if (
    s.includes("no space left") ||
    s.includes("enospc") ||
    s.includes("errno 28") ||
    s.includes("disk quota exceeded")
  ) {
    return "disk_full";
  }

  if (
    s.includes("resourceexhausted") ||
    s.includes("out of memory") ||
    s.includes("oom") ||
    s.includes("memoryerror") ||
    s.includes("cuda_error_out_of_memory") ||
    s.includes("failed to allocate") ||
    (s.includes("killed") && s.includes("memory"))
  ) {
    return "oom";
  }

  if (
    s.includes("larger than available snippets") ||
    (s.includes("n_snippets") && s.includes("available snippets"))
  ) {
    return "snippets_shortage";
  }

  if (s.includes("call weights do not match")) {
    return "call_weights";
  }

  if (
    s.includes("cannot mask with non-boolean") ||
    (s.includes("non-boolean array") && s.includes("na"))
  ) {
    return "cannot_mask_na";
  }

  if (
    s.includes("did you create the spectrogram") ||
    (s.includes("times.json") && (s.includes("not found") || s.includes("file not found")))
  ) {
    return "missing_spectrogram";
  }

  if (
    s.includes("no recordings left for create-spectrograms") ||
    (s.includes("excluded not annotated") && s.includes("create-spectrograms"))
  ) {
    return "empty_spectrogram_selection";
  }

  if (
    s.includes("missing label files") ||
    (s.includes("label file not found") && s.includes("label"))
  ) {
    return "missing_labels";
  }

  if (
    s.includes("couldn't find model weights") ||
    s.includes("model_weights.h5") ||
    (s.includes("keras model file") && s.includes("not found"))
  ) {
    return "model_missing";
  }

  if (
    s.includes("unknown model architecture") ||
    s.includes("lstm units not in") ||
    s.includes("is the right model specified")
  ) {
    return "architecture";
  }

  if (
    s.includes("spectrogram shape") &&
    (s.includes("not equal to input shape") || s.includes("input shape"))
  ) {
    return "shape_mismatch";
  }
  if (s.includes("divisible by 2**") || s.includes("divisible by 2^")) {
    return "shape_mismatch";
  }

  if (
    s.includes("permission denied") ||
    s.includes("errno 13") ||
    s.includes("operation not permitted")
  ) {
    return "permission";
  }

  if (
    s.includes("already exists") ||
    s.includes("set overwrite") ||
    s.includes("overwrite=true")
  ) {
    return "already_exists";
  }

  if (
    s.includes("engine exited (sys.exit)") ||
    s.includes("engine sys.exit") ||
    s.includes("aborted (engine sys.exit)")
  ) {
    return "engine_sys_exit";
  }

  if (
    s.includes("filenotfounderror") ||
    s.includes("no such file or directory") ||
    s.includes("file not found:") ||
    (s.includes("not found") && (s.includes(".wav") || s.includes(".csv") || s.includes("path")))
  ) {
    return "not_found";
  }

  return "generic";
}

export { pipelineErrorCopy } from "./pipelineErrorCopy";

export function resolveErrorLang(locale: string | undefined): "ru" | "en" {
  return (locale || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}
