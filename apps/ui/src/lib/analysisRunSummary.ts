export type AnalysisRunSummary = {
  succeeded: number;
  failed: number;
  total: number;
  /** Files whose `*_predicted.txt` was already on disk and not rewritten this run. */
  preexisting?: number;
};

export type AnalysisRunBannerTone = "error" | "warn" | "ok";

export function analysisRunBannerTone(
  summary: AnalysisRunSummary,
): AnalysisRunBannerTone {
  const preexisting = summary.preexisting ?? 0;
  if (summary.succeeded === 0 && preexisting === 0) return "error";
  if (summary.failed > 0 || preexisting > 0) return "warn";
  return "ok";
}

export function analysisRunBannerI18nKey(
  summary: AnalysisRunSummary,
):
  | "predict.analysis.runCompleteAllFailed"
  | "predict.analysis.runCompletePreexisting"
  | "predict.analysis.runCompletePartialPreexisting"
  | "predict.analysis.runCompletePartial"
  | "predict.analysis.runCompleteBanner" {
  const preexisting = summary.preexisting ?? 0;
  if (summary.succeeded === 0 && summary.failed > 0 && preexisting === 0) {
    return "predict.analysis.runCompleteAllFailed";
  }
  if (preexisting > 0 && summary.succeeded === 0 && summary.failed === 0) {
    return "predict.analysis.runCompletePreexisting";
  }
  if (preexisting > 0) {
    return "predict.analysis.runCompletePartialPreexisting";
  }
  if (summary.failed > 0) return "predict.analysis.runCompletePartial";
  return "predict.analysis.runCompleteBanner";
}
