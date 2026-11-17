import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RecordingTableSyncMode } from "../../lib/recordingTableSync";
import type { RecordingTableSyncExtras } from "../../lib/runProjectRecordingTableSync";
import { ConfirmDialog } from "../ConfirmDialog";

export type RefreshTableConfirm = {
  mode: RecordingTableSyncMode;
  extras: RecordingTableSyncExtras;
};

/** FR-2 п.6: create-recording-table never overwrites silently → explicit confirmation. */
export function RefreshTableDialog({
  open,
  tableExists,
  busy,
  defaultChannel = 1,
  onConfirm,
  onClose,
}: {
  open: boolean;
  tableExists: boolean;
  busy: boolean;
  /** Prefill -dc from the current table footer when known. */
  defaultChannel?: number;
  onConfirm: (choice: RefreshTableConfirm) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState(String(defaultChannel || 1));
  const [removeDupes, setRemoveDupes] = useState(false);
  const [excludePatterns, setExcludePatterns] = useState("");

  useEffect(() => {
    if (!open) return;
    setChannel(String(defaultChannel > 0 ? defaultChannel : 1));
    setRemoveDupes(false);
    setExcludePatterns("");
  }, [open, defaultChannel]);

  const extras = (): RecordingTableSyncExtras => {
    const parsed = Number.parseInt(channel, 10);
    return {
      default_channel: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
      remove_duplicate_filenames: removeDupes,
      exclude_patterns: excludePatterns.trim() || undefined,
    };
  };

  return (
    <ConfirmDialog open={open} title={t("projects.studio.confirmRefresh.title")} onClose={onClose}>
      <p className="mb-4 text-sm text-foreground-muted">
        {tableExists
          ? t("projects.studio.confirmRefresh.bodyUpdate")
          : t("projects.studio.confirmRefresh.bodyCreate")}
      </p>
      <div className="mb-4 space-y-2 rounded border border-[color:var(--border,rgba(255,255,255,0.08))] p-3">
        <p className="text-xs font-medium text-foreground">
          {t("projects.studio.confirmRefresh.advancedTitle")}
        </p>
        <label className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
          <span className="min-w-[8rem]">{t("projects.studio.confirmRefresh.defaultChannel")}</span>
          <input
            type="number"
            min={1}
            step={1}
            className="tw-input w-20"
            value={channel}
            disabled={busy}
            onChange={(e) => setChannel(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-foreground-muted">
          <input
            type="checkbox"
            checked={removeDupes}
            disabled={busy}
            onChange={(e) => setRemoveDupes(e.target.checked)}
          />
          <span>{t("projects.studio.confirmRefresh.removeDuplicates")}</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>{t("projects.studio.confirmRefresh.excludePatterns")}</span>
          <input
            type="text"
            className="tw-input w-full"
            placeholder={t("projects.studio.confirmRefresh.excludePatternsPlaceholder")}
            value={excludePatterns}
            disabled={busy}
            onChange={(e) => setExcludePatterns(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ps-btn ps-btn-primary"
          disabled={busy}
          onClick={() =>
            onConfirm({ mode: tableExists ? "merge" : "create", extras: extras() })
          }
        >
          {t("projects.studio.confirmRefresh.action")}
        </button>
        {tableExists ? (
          <button
            type="button"
            className="ps-btn ps-btn-danger"
            disabled={busy}
            title={t("projects.studio.confirmRefresh.rebuildHint")}
            onClick={() => onConfirm({ mode: "rebuild", extras: extras() })}
          >
            {t("projects.studio.confirmRefresh.rebuild")}
          </button>
        ) : null}
        <button type="button" className="ps-btn" disabled={busy} onClick={onClose}>
          {t("projects.wizard.cancel")}
        </button>
      </div>
    </ConfirmDialog>
  );
}

export function DeleteRecordingsDialog({
  open,
  count,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  count: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog open={open} title={t("projects.studio.confirmDeleteFiles.title")} onClose={onClose}>
      <p className="mb-4 text-sm text-foreground-muted">
        {t("projects.studio.confirmDeleteFiles.body", { count })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          disabled={busy}
          onClick={onConfirm}
        >
          {t("projects.studio.confirmDeleteFiles.action")}
        </button>
        <button type="button" className="ps-btn" disabled={busy} onClick={onClose}>
          {t("projects.wizard.cancel")}
        </button>
      </div>
    </ConfirmDialog>
  );
}

export function DeleteProjectDialog({
  open,
  busy,
  onDelete,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  onDelete: (deleteFiles: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog open={open} title={t("projects.deleteProjectModal.title")} onClose={onClose} busy={busy}>
      <p className="mb-3 text-sm text-foreground-muted">
        {t("projects.deleteProjectModal.intro")}
      </p>
      <ul className="mb-4 space-y-2 text-xs text-foreground-muted">
        <li>
          <span className="font-medium text-foreground">
            {t("projects.wizard.removeFromList")}:
          </span>{" "}
          {t("projects.deleteProjectModal.removeFromListHint")}
        </li>
        <li>
          <span className="font-medium text-foreground">
            {t("projects.wizard.deleteFolder")}:
          </span>{" "}
          {t("projects.deleteProjectModal.deleteFolderHint")}
        </li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDelete(false)}
          disabled={busy}
          className="ps-btn"
        >
          {t("projects.wizard.removeFromList")}
        </button>
        <button
          type="button"
          onClick={() => onDelete(true)}
          disabled={busy}
          className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          {t("projects.wizard.deleteFolder")}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="ps-btn">
          {t("projects.wizard.cancel")}
        </button>
      </div>
    </ConfirmDialog>
  );
}
