/** Client-side path for orcAI default predict output (matches sidecar resolve_predict_output_path). */

/** modelLabelName should match orcai_parameter.json "name" (sidecar output naming). */
export function inferPredictedLabelPath(
  wavPath: string,
  channel: number,
  modelId: string,
  modelLabelName?: string,
): string {
  const stem = wavPath.replace(/\.wav$/i, "");
  const modelSegment =
    modelLabelName?.trim() ||
    modelId.replace(/\.keras$/i, "").split(/[/\\]/).pop() ||
    modelId;
  return `${stem}_c${channel}_${modelSegment}_predicted.txt`;
}
