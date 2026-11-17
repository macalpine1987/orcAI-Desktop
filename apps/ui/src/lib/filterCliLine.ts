import { liveLogVerbosity } from "./integrationSettings";
import { shellQuote } from "./predictCliLine";

export type FilterCliParams = {
  predictedLabels: string;
  outputFile?: string;
  overwrite?: boolean;
  callDurationLimits?: string;
  labelSuffix?: string;
  /** When omitted, uses Settings log verbosity (same as createJob inject). */
  verbosity?: number;
};

/** Flag order matches sidecar `_OPTIONS["filter-predictions"]`. */
export function buildFilterCliLine(params: FilterCliParams): string {
  const parts: string[] = ["orcai", "filter-predictions"];
  const predicted = params.predictedLabels.trim();
  if (predicted) parts.push(shellQuote(predicted));
  const out = params.outputFile?.trim();
  if (out && out !== "default") {
    parts.push("-o", shellQuote(out));
  }
  if (params.overwrite) parts.push("-ow");
  const cdl = params.callDurationLimits?.trim();
  if (cdl) parts.push("-cdl", shellQuote(cdl));
  const ls = params.labelSuffix?.trim();
  if (ls === "") parts.push("-ls", shellQuote(""));
  else if (ls && ls !== "*") parts.push("-ls", shellQuote(ls));
  const verbosity =
    params.verbosity !== undefined && params.verbosity !== null
      ? Number(params.verbosity)
      : liveLogVerbosity();
  if (Number.isFinite(verbosity)) {
    parts.push("-v", String(verbosity));
  }
  return parts.join(" ");
}
