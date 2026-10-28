import { useEffect, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectRecord } from "../../api/projects";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../../lib/predictAppModal";
import { focusLabel } from "../../lib/projectsStudio";
import { ModalCloseButton } from "../ModalCloseButton";

type Props = {
  open: boolean;
  projects: ProjectRecord[];
  /** Currently open studio project. */
  currentProjectId: string | null;
  activeProjectId: string | null;
  busy?: boolean;
  onClose: () => void;
  onOpen: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
};

/** Semi-transparent modal: project registry — open / delete (name is fixed after create). */
export function ProjectListModal({
  open,
  projects,
  currentProjectId,
  activeProjectId,
  busy = false,
  onClose,
  onOpen,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const rows = useMemo(() => {
    const list = [...projects];
    list.sort((a, b) => {
      if (a.id === currentProjectId) return -1;
      if (b.id === currentProjectId) return 1;
      return a.display_name.localeCompare(b.display_name);
    });
    return list;
  }, [projects, currentProjectId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (!busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={PREDICT_APP_MODAL_OVERLAY_CLASS}
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="ps-project-list-dialog mat-panel shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ps-project-list-head">
            <div className="modal-dialog-head">
              <h2 id={titleId} className="ps-project-list-title">
                {t("projects.studio.listModal.title")}
              </h2>
              <ModalCloseButton disabled={busy} onClick={onClose} />
            </div>
            <p className="ps-project-list-hint">{t("projects.studio.listModal.hint")}</p>
          </div>

          {rows.length === 0 ? (
            <p className="ps-project-list-empty">{t("projects.studio.listModal.empty")}</p>
          ) : (
            <ul className="ps-project-list" role="list">
              {rows.map((project) => {
                const isCurrent = project.id === currentProjectId;
                const isActive = project.id === activeProjectId;
                return (
                  <li
                    key={project.id}
                    className={clsxRow(isCurrent)}
                  >
                    <button
                      type="button"
                      className="ps-project-list-main"
                      disabled={busy}
                      onClick={() => {
                        if (isCurrent) {
                          onClose();
                          return;
                        }
                        onOpen(project);
                      }}
                      title={project.path}
                    >
                      <span className="ps-project-list-name">{project.display_name}</span>
                      <span className="ps-project-list-meta">
                        {isCurrent ? (
                          <span className="ps-badge ps-badge-active">
                            {t("projects.studio.listModal.openHere")}
                          </span>
                        ) : null}
                        {isActive && !isCurrent ? (
                          <span className="ps-badge">
                            {t("projects.studio.listModal.appActive")}
                          </span>
                        ) : null}
                        <span className="ps-project-list-focus">
                          {focusLabel(project.focus, t)}
                        </span>
                        <span className="ps-project-list-path">{project.path}</span>
                      </span>
                    </button>
                    <div className="ps-project-list-tools">
                      <button
                        type="button"
                        className="ps-btn ps-btn-sm ps-btn-danger"
                        disabled={busy}
                        onClick={() => onDelete(project)}
                      >
                        {t("projects.studio.actions.delete")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </PredictAppModalPortal>
  );
}

function clsxRow(isCurrent: boolean): string {
  return isCurrent ? "ps-project-list-row is-current" : "ps-project-list-row";
}
