import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type {
  ProjectRecordingTable,
  ProjectTableRow,
  RecordingPredictStatus,
} from "../../api/projects";
import { formatBytes } from "../../lib/formatAudio";
import {
  formatKHz,
  formatRowDuration,
  formatShortDateTime,
  predictStatusKey,
  resampleNotes,
  type ProjectsPageMode,
} from "../../lib/projectsStudio";
import { IconAudioLarge, IconPlus, IconRefresh } from "./ProjectsIcons";
import { useWavDropZone } from "./useWavDropZone";

type Props = {
  table: ProjectRecordingTable | null;
  loading: boolean;
  mode: ProjectsPageMode;
  selected: Set<string>;
  busy: boolean;
  canModify: boolean;
  engineReady: boolean;
  showAllColumns: boolean;
  autoSyncCsv: boolean;
  tableNeedsRefresh: boolean;
  /** Primary next-step action — soft-orange CTA hint. */
  guidedAction?: "sync_table" | "predict" | null;
  onToggleColumns: () => void;
  onToggleAutoSyncCsv: (enabled: boolean) => void;
  onToggleRow: (recording: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRefreshTable: () => void;
  onAddWav: () => void;
  onImportWavPaths: (paths: string[]) => void;
  onDeleteSelected: () => void;
  onChannelChange: (recording: string, channel: number) => void;
};

const PILL_CLASS: Record<RecordingPredictStatus, string> = {
  done: "is-done",
  running: "is-running",
  failed: "is-failed",
  none: "",
};

function fileCell(row: ProjectTableRow, t: (k: string) => string) {
  return (
    <>
      <span title={row.wav_path ?? row.recording}>{row.recording}</span>
      {!row.in_table ? <span className="ps-tag is-warn">{t("projects.studio.table.notInTable")}</span> : null}
      {!row.wav_exists ? <span className="ps-tag is-err">{t("projects.studio.table.wavMissing")}</span> : null}
      {row.duplicate ? <span className="ps-tag">{t("projects.studio.table.duplicate")}</span> : null}
    </>
  );
}

/** m02 / m33 / m34 «Записи»: recording_table.csv + computed columns, channel editable. */
export function ProjectRecordingsTab({
  table,
  loading,
  mode,
  selected,
  busy,
  canModify,
  engineReady,
  showAllColumns,
  autoSyncCsv,
  tableNeedsRefresh,
  guidedAction = null,
  onToggleColumns,
  onToggleAutoSyncCsv,
  onToggleRow,
  onSelectAll,
  onClearSelection,
  onRefreshTable,
  onAddWav,
  onImportWavPaths,
  onDeleteSelected,
  onChannelChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const rows = table?.rows ?? [];
  const guideRefresh =
    !autoSyncCsv && (guidedAction === "sync_table" || tableNeedsRefresh);
  const extraColumns = showAllColumns && table
    ? table.columns.filter((c) => c !== "recording" && c !== "channel")
    : [];
  const notes = table ? resampleNotes(rows) : [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.recording));
  const dropEnabled = canModify && !busy;
  const { zoneRef, active: dropActive, dropProps } = useWavDropZone({
    enabled: dropEnabled,
    onDropPaths: onImportWavPaths,
  });

  const refreshTitle = autoSyncCsv
    ? t("projects.studio.table.autoSyncCsvTip")
    : !engineReady
      ? t("projects.studio.actions.needsEngine")
      : tableNeedsRefresh
        ? t("projects.studio.table.tableStale")
        : t("projects.studio.confirmRefresh.bodyUpdate");

  const refreshButton = (
    <button
      type="button"
      className={clsx("ps-btn", guideRefresh && "ps-btn-attention")}
      onClick={onRefreshTable}
      disabled={busy || !engineReady || autoSyncCsv}
      title={refreshTitle}
    >
      <IconRefresh />
      {t("projects.studio.actions.refreshTable")}
    </button>
  );

  if (loading && !table) {
    return <p className="text-xs text-foreground-muted">{t("projects.studio.table.loading")}</p>;
  }

  if (mode === "empty" || rows.length === 0) {
    return (
      <div className="space-y-3">
        <div
          ref={zoneRef}
          className={clsx("ps-empty", dropActive && "is-drop-active")}
          {...dropProps}
        >
          <IconAudioLarge className="ps-empty-icon" />
          <div className="min-w-0">
            <h3 className="ps-empty-title">{t("projects.studio.empty.title")}</h3>
            <p className="ps-empty-steps">{t("projects.studio.empty.steps")}</p>
            <p className="ps-empty-drop-hint">{t("projects.studio.empty.dropHint")}</p>
            <div className="ps-empty-actions">
              <button
                type="button"
                className="ps-btn"
                onClick={onAddWav}
                disabled={busy || !canModify}
                title={!canModify ? t("projects.recordingsRequireInit") : undefined}
              >
                <IconPlus />
                {t("projects.studio.actions.addWav")}
              </button>
            </div>
          </div>
        </div>
        {table?.table_exists ? (
          <p className="ps-footer">
            <span>{t("projects.studio.table.rows", { count: table.row_count })}</span>
          </p>
        ) : null}
      </div>
    );
  }

  const staleRows = rows.some((r) => !r.in_table);

  return (
    <div
      ref={zoneRef}
      className={clsx("space-y-3 ps-recordings-drop", dropActive && "is-drop-active")}
      {...dropProps}
    >
      {!table?.table_exists && !tableNeedsRefresh ? null : staleRows || tableNeedsRefresh ? (
        <p className="ps-hint-bar is-warn">{t("projects.studio.table.tableStale")}</p>
      ) : null}

      <div className="ps-toolbar">
        <span>
          {t("projects.studio.actions.selected", {
            selected: selected.size,
            total: rows.length,
          })}
        </span>
        <button
          type="button"
          className="ps-btn ps-btn-sm"
          onClick={allSelected ? onClearSelection : onSelectAll}
        >
          {allSelected
            ? t("projects.studio.actions.clearSelection")
            : t("projects.studio.actions.selectAll")}
        </button>
        <label className="ps-toolbar-check">
          <input
            type="checkbox"
            checked={showAllColumns}
            onChange={onToggleColumns}
          />
          <span>{t("projects.studio.table.showCsvColumns")}</span>
        </label>
        <label
          className="ps-toolbar-check"
          title={t("projects.studio.table.autoSyncCsvTip")}
        >
          <input
            type="checkbox"
            checked={autoSyncCsv}
            disabled={busy}
            onChange={(e) => onToggleAutoSyncCsv(e.target.checked)}
          />
          <span>{t("projects.studio.table.autoSyncCsv")}</span>
        </label>
        <div className="ps-toolbar-actions">
          {refreshButton}
          <button
            type="button"
            className="ps-btn"
            onClick={onAddWav}
            disabled={busy || !canModify}
            title={!canModify ? t("projects.recordingsRequireInit") : undefined}
          >
            <IconPlus />
            {t("projects.studio.actions.addWav")}
          </button>
          <button
            type="button"
            className="ps-btn ps-btn-danger"
            onClick={onDeleteSelected}
            disabled={busy || !canModify || selected.size === 0}
          >
            {t("projects.studio.actions.delete")}
          </button>
        </div>
      </div>

      <div className="ps-table-wrap max-h-[min(26rem,50cqh)]">
        <table className="ps-table">
          <thead>
            <tr>
              <th className="w-8">
                <span className="sr-only">{t("projects.studio.table.select")}</span>
              </th>
              <th>{t("projects.studio.table.file")}</th>
              <th className="is-center">{t("projects.studio.table.channel")}</th>
              <th>{t("projects.studio.table.rate")}</th>
              <th>{t("projects.studio.table.duration")}</th>
              <th>{t("projects.studio.table.annotation")}</th>
              <th>{t("projects.studio.table.predict")}</th>
              {extraColumns.map((c) => (
                <th key={c} className="is-mono">
                  {c}
                </th>
              ))}
              <th className="is-right">{t("projects.studio.table.size")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSel = selected.has(row.recording);
              const maxCh = Math.max(1, row.channels ?? 1);
              return (
                <tr
                  key={row.recording}
                  className={clsx(isSel && "is-selected")}
                  onClick={() => onToggleRow(row.recording)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggleRow(row.recording)}
                      aria-label={row.recording}
                    />
                  </td>
                  <td className="is-file">{fileCell(row, t)}</td>
                  <td className="is-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      className="ps-channel-input"
                      min={1}
                      max={maxCh}
                      step={1}
                      value={row.channel ?? table?.default_channel ?? 1}
                      disabled={busy || !row.in_table}
                      title={t("projects.studio.table.channelEditTitle")}
                      aria-label={`${t("projects.studio.table.channel")} ${row.recording}`}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isInteger(v) && v >= 1 && v <= maxCh) {
                          onChannelChange(row.recording, v);
                        }
                      }}
                    />
                  </td>
                  <td className="is-mono is-muted">
                    {formatKHz(row.sample_rate_hz, t)}
                    {row.resample_to_hz ? (
                      <span className="ps-tag is-warn" title={t("projects.studio.table.resampleNote", {
                        from: formatKHz(row.sample_rate_hz, t),
                        to: formatKHz(row.resample_to_hz, t),
                      })}>
                        → {formatKHz(row.resample_to_hz, t)}
                      </span>
                    ) : null}
                  </td>
                  <td className="is-mono is-muted">{formatRowDuration(row.duration_sec)}</td>
                  <td className="is-muted">
                    <span className={clsx("ps-dot", row.annotation_exists && "is-ok")} aria-hidden />
                    {row.annotation_exists
                      ? t("projects.studio.table.annotationPresent")
                      : t("projects.studio.table.annotationMissing")}
                  </td>
                  <td>
                    <span className={clsx("ps-pill", PILL_CLASS[row.predict_status])}>
                      {t(predictStatusKey(row.predict_status))}
                    </span>
                  </td>
                  {extraColumns.map((c) => (
                    <td key={c} className="is-wide" title={row.cells[c] ?? ""}>
                      {row.cells[c] ?? ""}
                    </td>
                  ))}
                  <td className="is-right is-mono is-muted">
                    {row.size_bytes != null ? formatBytes(row.size_bytes) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ps-footer">
        {table?.updated_at ? (
          <span>
            {t("projects.studio.table.updated", {
              date: formatShortDateTime(table.updated_at, i18n.language),
            })}
          </span>
        ) : null}
        <span>{t("projects.studio.table.rows", { count: table?.row_count ?? rows.length })}</span>
        {table ? (
          <span>{t("projects.studio.table.baseChannel", { channel: table.default_channel })}</span>
        ) : null}
        {notes.length > 0 ? (
          <span className="ps-footer-right ps-text-warn">
            {notes
              .map((n) =>
                t("projects.studio.table.resampleNote", {
                  from: formatKHz(n.from, t),
                  to: formatKHz(n.to, t),
                }),
              )
              .join(" · ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
