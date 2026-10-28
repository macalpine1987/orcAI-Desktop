import { useTranslation } from "react-i18next";
import { IconFolder, IconPlus, IconProjectsList } from "./ProjectsIcons";

type Props = {
  hasProject: boolean;
  busy: boolean;
  onCreate: () => void;
  onOpenFolder: () => void;
  onOpenProjectList: () => void;
};

/** m02 top row: Create · Open project folder · Project list. */
export function ProjectsActionsBar({
  hasProject,
  busy,
  onCreate,
  onOpenFolder,
  onOpenProjectList,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="ps-actions">
      <button type="button" className="ps-btn ps-btn-primary" onClick={onCreate} disabled={busy}>
        <IconPlus />
        {t("projects.studio.actions.create")}
      </button>
      <button
        type="button"
        className="ps-btn"
        onClick={onOpenFolder}
        disabled={busy || !hasProject}
      >
        <IconFolder />
        {t("projects.studio.actions.openFolder")}
      </button>
      <button
        type="button"
        className="ps-btn"
        onClick={onOpenProjectList}
        disabled={busy}
        title={t("projects.studio.listModal.hint")}
      >
        <IconProjectsList />
        {t("projects.studio.actions.projectList")}
      </button>
      <span className="ps-actions-hint">{t("projects.studio.actions.commandsHint")}</span>
    </div>
  );
}
