import { useTranslation } from "react-i18next";
import {
  countPackageRunnable,
  packageRunBreakdown,
  resolvePackageFileNames,
  type AnalysisPackage,
} from "../workspace/analysisPackages";
import type { PredictQueue } from "../workspace/predictQueue";
import { PredictAnalysisPackageSelectorBar } from "./PredictAnalysisPackageSelectorBar";

type Props = {
  queue: PredictQueue;
  packages: AnalysisPackage[];
  activePackage: AnalysisPackage | null;
  menuOpen: boolean;
  onToggleMenu: (anchor: { x: number; y: number }) => void;
  orcaiReady: boolean;
  batchRunning: boolean;
  batchProgress: { done: number; total: number } | null;
  exportSelectedCount: number;
  exporting?: boolean;
  onAnalyze: () => void;
  onBatchCancel: () => void;
  onExport?: () => void;
};

export function PredictAnalysisToolbar({
  queue,
  packages,
  activePackage,
  menuOpen,
  onToggleMenu,
  orcaiReady,
  batchRunning,
  batchProgress,
  exportSelectedCount,
  exporting = false,
  onAnalyze,
  onBatchCancel,
  onExport,
}: Props) {
  const { t } = useTranslation();

  const resolvedNames = activePackage
    ? resolvePackageFileNames(queue, activePackage)
    : [];
  const runnable = activePackage
    ? countPackageRunnable(queue, resolvedNames)
    : 0;
  const runBreakdown = activePackage
    ? packageRunBreakdown(queue, resolvedNames)
    : { runnable: 0, rerun: 0, fresh: 0 };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="analysis-lab-toolbar flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5"
        role="toolbar"
        aria-label={t("predict.analysis.toolbar.ariaLabel")}
      >
        <PredictAnalysisPackageSelectorBar
          inline
          queue={queue}
          packages={packages}
          activePackage={activePackage}
          disabled={batchRunning}
          menuOpen={menuOpen}
          onToggleMenu={onToggleMenu}
        />

        <div
          className="hidden h-8 w-px shrink-0 bg-border md:block"
          aria-hidden
        />

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={
              !activePackage || !orcaiReady || batchRunning || runnable === 0
            }
            onClick={onAnalyze}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:opacity-95 disabled:opacity-40"
          >
            {batchRunning && batchProgress
              ? t("predict.batchRunning", {
                  done: Math.min(
                    batchProgress.total,
                    Math.floor(batchProgress.done),
                  ),
                  total: batchProgress.total,
                })
              : t("predict.analysisPackage.analyze")}
          </button>
          {batchRunning ? (
            <button
              type="button"
              onClick={onBatchCancel}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              {t("predict.batchCancel")}
            </button>
          ) : null}
        </div>

        {activePackage ? (
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:pl-0">
              <button
                type="button"
                disabled={batchRunning || exporting || exportSelectedCount === 0}
                onClick={onExport}
                title={t("predict.analysis.toolbar.exportHint")}
                className="mat-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {exporting
                  ? t("common.loading")
                  : t("predict.analysis.toolbar.exportAudacity")}
                {exportSelectedCount > 0 ? (
                  <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-accent">
                    {exportSelectedCount}
                  </span>
                ) : null}
              </button>
            </div>
          </>
        ) : null}
      </div>

      {batchRunning && batchProgress ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={batchProgress.done}
          aria-valuemin={0}
          aria-valuemax={batchProgress.total}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{
              width: `${Math.round((batchProgress.done / batchProgress.total) * 100)}%`,
            }}
          />
        </div>
      ) : null}

      {activePackage ? (
        <p className="text-xs text-foreground-muted">
          {runBreakdown.rerun > 0
            ? t("predict.analysisPackage.runSummaryWithRerun", {
                total: resolvedNames.length,
                runnable: runBreakdown.runnable,
                rerun: runBreakdown.rerun,
                fresh: runBreakdown.fresh,
              })
            : t("predict.analysisPackage.runSummary", {
                total: resolvedNames.length,
                runnable,
              })}
          {runnable === 0 && !batchRunning
            ? ` · ${t("predict.analysisPackage.nothingToRun")}`
            : null}
        </p>
      ) : null}
    </div>
  );
}
