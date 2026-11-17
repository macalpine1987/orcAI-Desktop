import { useTranslation } from "react-i18next";
import {
  isFileSelectedForPredict,
  type PredictQueue,
  type PredictQueueFile,
} from "../../workspace/predictQueue";
import type { PredictQueueViewFilter } from "../../lib/predictQueueStudio";
import {
  queueUnavailableMessageKey,
  shouldShowQueueLoading,
  type PredictQueueUnavailableReason,
} from "../../lib/predictQueueUi";
import { channelForQueueFile } from "./predictParamsHelpers";
import { QueueRow } from "./QueueRow";

type Props = {
  queue: PredictQueue | null;
  queueUnavailable?: PredictQueueUnavailableReason | null;
  queueLoading?: boolean;
  batchRunning: boolean;
  busy?: boolean;
  canManageFiles: boolean;
  viewFilter: PredictQueueViewFilter;
  onFilterChange: (f: PredictQueueViewFilter) => void;
  allAudio: PredictQueueFile[];
  visible: PredictQueueFile[];
  selectedCount: number;
  hoursLabel: string | null;
  etaLabel: string;
  channelMap: Record<string, number>;
  settingsChannel: number;
  activeFileName?: string | null;
  runningFileName?: string | null;
  onSelectActive: (name: string) => void;
  onToggleBatchSelect: (name: string) => void;
  onAddWavs: () => void;
};

export function PredictParamsQueuePanel({
  queue,
  queueUnavailable,
  queueLoading,
  batchRunning,
  busy,
  canManageFiles,
  viewFilter,
  onFilterChange,
  allAudio,
  visible,
  selectedCount,
  hoursLabel,
  etaLabel,
  channelMap,
  settingsChannel,
  activeFileName,
  runningFileName,
  onSelectActive,
  onToggleBatchSelect,
  onAddWavs,
}: Props) {
  const { t } = useTranslation();
  return (
        <section className="pp-col pp-col--queue" aria-labelledby="pp-queue-label">
          <div className="pp-col-head">
            <h2 id="pp-queue-label" className="pp-col-label">
              {t("predict.run.queueStudioTitle")}
            </h2>
            <span className="pp-col-meta">
              {hoursLabel != null
                ? t("predict.run.queueMeta", {
                    count: allAudio.length,
                    hours: hoursLabel,
                  })
                : t("predict.run.queueMetaCountOnly", {
                    count: allAudio.length,
                  })}
            </span>
          </div>
          <p className="pp-queue-hint">{t("predict.run.queueStudioHint")}</p>

          <div
            className="pp-filter-seg"
            role="group"
            aria-label={t("predict.run.filterAria")}
          >
            {(
              [
                ["all", t("predict.run.filterAll")],
                ["new", t("predict.run.filterNew")],
                ["failed", t("predict.run.filterFailed")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={viewFilter === id}
                disabled={!queue || batchRunning}
                onClick={() => onFilterChange(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="pp-queue-run-meta">
            <span>
              {t("predict.run.selectedCount", {
                selected: selectedCount,
                visible: visible.length,
              })}
            </span>
            <span title={t("predict.run.etaHint")}>
              {t("predict.run.etaLabel", { eta: etaLabel })}
            </span>
          </div>

          <div className="pp-queue-table-wrap">
            {queueUnavailable ? (
              <p className="pp-empty">
                {t(queueUnavailableMessageKey(queueUnavailable))}
              </p>
            ) : shouldShowQueueLoading({
                hasActiveProject: true,
                queueLoading: Boolean(queueLoading),
                queueUnavailable: queueUnavailable ?? null,
                hasQueue: queue != null,
              }) ? (
              <p className="pp-empty">{t("shellMeta.loading")}</p>
            ) : !queue || allAudio.length === 0 ? (
              <div className="pp-empty">
                <p>{t("predict.queueEmpty")}</p>
                {canManageFiles ? (
                  <button
                    type="button"
                    className="ps-btn mt-2"
                    disabled={busy || batchRunning}
                    onClick={onAddWavs}
                  >
                    {t("predict.queueAddWavs")}
                  </button>
                ) : null}
              </div>
            ) : visible.length === 0 ? (
              <p className="pp-empty">
                {viewFilter === "failed"
                  ? t("predict.run.queueFilterEmptyFailed")
                  : viewFilter === "new"
                    ? t("predict.run.queueFilterEmptyNew")
                    : t("predict.queueEmpty")}
              </p>
            ) : (
              <table className="pp-queue-table">
                <thead>
                  <tr>
                    <th scope="col" className="pp-queue-th-check">
                      <span className="sr-only">{t("predict.run.colSelect")}</span>
                    </th>
                    <th scope="col" className="pp-queue-th-file">
                      {t("predict.run.colFile")}
                    </th>
                    <th scope="col" className="pp-queue-th-ch">
                      {t("predict.run.colChannel")}
                    </th>
                    <th scope="col" className="pp-queue-th-status">
                      {t("predict.run.colStatus")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((file) => (
                    <QueueRow
                      key={file.name}
                      file={file}
                      channel={channelForQueueFile(file.name, channelMap, settingsChannel)}
                      selected={isFileSelectedForPredict(queue, file.name)}
                      active={
                        file.name === activeFileName ||
                        file.name === runningFileName
                      }
                      disabled={batchRunning}
                      onSelectActive={onSelectActive}
                      onToggleBatchSelect={onToggleBatchSelect}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
  );
}
