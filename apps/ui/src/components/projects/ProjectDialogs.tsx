import { useTranslation } from "react-i18next";
import type { RecordingTableSyncMode } from "../../lib/recordingTableSync";
import { ConfirmDialog } from "../ConfirmDialog";

/** FR-2 п.6: create-recording-table never overwrites silently → explicit confirmation. */
export function RefreshTableDialog({
  open,
  tableExists,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  tableExists: boolean;
  busy: boolean;
  onConfirm: (mode: RecordingTableSyncMode) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog open={open} title={t("projects.studio.confirmRefresh.title")} onClose={onClose}>
      <p className="mb-4 text-sm text-foreground-muted">
        {tableExists
          ? t("projects.studio.confirmRefresh.bodyUpdate")
          : t("projects.studio.confirmRefresh.bodyCreate")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ps-btn ps-btn-primary"
          disabled={busy}
          onClick={() => onConfirm(tableExists ? "merge" : "create")}
        >
          {t("projects.studio.confirmRefresh.action")}
        </button>
        {tableExists ? (
          <button
            type="button"
            className="ps-btn ps-btn-danger"
            disabled={busy}
            title={t("projects.studio.confirmRefresh.rebuildHint")}
            onClick={() => onConfirm("rebuild")}
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
