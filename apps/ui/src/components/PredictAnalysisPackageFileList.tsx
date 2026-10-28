import { useTranslation } from "react-i18next";
import { formatDurationSec } from "../lib/formatAudio";
import type { PredictQueueFile } from "../workspace/predictQueue";

function statusDotClass(status: PredictQueueFile["status"]): string {
  switch (status) {
    case "running":
      return "bg-accent animate-pulse";
    case "done":
    case "filtered":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-foreground-muted/50";
  }
}

function statusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  file: PredictQueueFile,
): string {
  switch (file.status) {
    case "pending":
      return t("predict.queueStatusPending");
    case "running":
      return t("predict.queueStatusRunning");
    case "done":
      return t("predict.queueStatusDone");
    case "filtered":
      return t("predict.queueStatusFiltered");
    case "failed":
      return file.error
        ? t("predict.queueStatusFailedWithError", { error: file.error })
        : t("predict.queueStatusFailed");
    default:
      return "";
  }
}

type Props = {
  files: PredictQueueFile[];
  activeFileName: string | null;
  exportSelected: ReadonlySet<string>;
  onlyWithLabels: boolean;
  onOnlyWithLabelsChange: (value: boolean) => void;
  onSelectFile: (name: string) => void;
  onToggleExport: (name: string) => void;
  onToggleExportAll: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
};

export function PredictAnalysisPackageFileList({
  files,
  activeFileName,
  exportSelected,
  onlyWithLabels,
  onOnlyWithLabelsChange,
  onSelectFile,
  onToggleExport,
  onToggleExportAll,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: Props) {
  const { t } = useTranslation();

  const allExportChecked =
    files.length > 0 && files.every((f) => exportSelected.has(f.name));
  const someExportChecked =
    files.some((f) => exportSelected.has(f.name)) && !allExportChecked;

  return (
    <section className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">
          {t("predict.analysis.spectrogram.fileListTitle")}
        </h3>
        <span className="text-[10px] tabular-nums text-foreground-muted">
          {files.length}
        </span>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground-muted">
        <input
          type="checkbox"
          className="rounded border-border"
          checked={onlyWithLabels}
          onChange={(e) => onOnlyWithLabelsChange(e.target.checked)}
        />
        {t("predict.analysis.spectrogram.onlyWithLabels")}
      </label>

      {files.length > 0 ? (
        <label className="flex cursor-pointer items-center gap-2 border-b border-border/60 pb-2 text-[11px] text-foreground-muted">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={allExportChecked}
            ref={(el) => {
              if (el) el.indeterminate = someExportChecked;
            }}
            onChange={onToggleExportAll}
          />
          {t("predict.analysis.export.selectAll")}
        </label>
      ) : null}

      <div className="flex gap-1">
        <button
          type="button"
          disabled={!canPrev}
          onClick={onPrev}
          className="flex-1 mat-btn px-2 py-1 text-xs disabled:opacity-30"
          aria-label={t("predict.analysis.spectrogram.prev")}
        >
          {t("predict.analysis.spectrogram.prev")}
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={onNext}
          className="flex-1 mat-btn px-2 py-1 text-xs disabled:opacity-30"
          aria-label={t("predict.analysis.spectrogram.next")}
        >
          {t("predict.analysis.spectrogram.next")}
        </button>
      </div>

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-foreground-muted">
          {onlyWithLabels
            ? t("predict.analysis.spectrogram.noLabeledFiles")
            : t("predict.analysis.spectrogram.emptyPackage")}
        </p>
      ) : (
        <ul
          className="max-h-[min(22rem,40cqh)] space-y-0.5 overflow-y-auto mat-panel/80 p-1"
          role="listbox"
          aria-label={t("predict.analysis.spectrogram.fileListTitle")}
        >
          {files.map((file) => {
            const selected = file.name === activeFileName;
            const exportOn = exportSelected.has(file.name);
            const duration =
              file.duration_sec != null
                ? formatDurationSec(file.duration_sec)
                : null;
            return (
              <li key={file.name} className="flex items-stretch gap-0.5">
                <label
                  className="flex shrink-0 cursor-pointer items-center px-1.5 py-2"
                  title={t("predict.analysis.export.checkboxHint")}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={exportOn}
                    onChange={() => onToggleExport(file.name)}
                    aria-label={t("predict.analysis.export.checkboxAria", {
                      name: file.name,
                    })}
                  />
                </label>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelectFile(file.name)}
                  className={`flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors ${
                    selected
                      ? "bg-accent/12 text-foreground ring-1 ring-accent/30"
                      : "text-foreground-muted hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(file.status)}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {file.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] opacity-80">
                      {statusLabel(t, file)}
                      {duration ? ` · ${duration}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
