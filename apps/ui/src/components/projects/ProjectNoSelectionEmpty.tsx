import { useTranslation } from "react-i18next";
import { IconFolder, IconFolderLarge, IconPlus } from "./ProjectsIcons";

type Props = {
  busy: boolean;
  sidecarOnline: boolean;
  onCreate: () => void;
  onOpenExisting: () => void;
};

const CATALOG_ITEMS = [
  "recordings/",
  "annotations/",
  "recording_table.csv",
  "*_orcai_parameter.json",
  "predictions/",
  "models/",
  "tvt_data/",
] as const;

/**
 * No-project landing · mockup `docs/cursor-handoff/mockups/m-projects-no-selection-welcome.png`.
 * Path cards + catalog memo; work toolbar is hidden while no project is open.
 */
export function ProjectNoSelectionEmpty({
  busy,
  sidecarOnline,
  onCreate,
  onOpenExisting,
}: Props) {
  const { t } = useTranslation();

  if (!sidecarOnline) {
    return (
      <section className="ps-welcome" aria-label={t("projects.studio.empty.noProjectTitle")}>
        <IconFolderLarge size={48} className="ps-welcome-icon" />
        <div className="ps-welcome-body">
          <p className="ps-eyebrow">{t("projects.studio.empty.welcomeEyebrow")}</p>
          <h3 className="ps-welcome-title">{t("projects.studio.empty.noProjectTitle")}</h3>
          <p className="ps-welcome-hint">{t("projects.studio.empty.sidecarOffline")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="ps-welcome" aria-label={t("projects.studio.empty.noProjectTitle")}>
      <IconFolderLarge size={48} className="ps-welcome-icon" />
      <div className="ps-welcome-body">
        <p className="ps-eyebrow">{t("projects.studio.empty.welcomeEyebrow")}</p>
        <h3 className="ps-welcome-title">{t("projects.studio.empty.noProjectTitle")}</h3>
        <p className="ps-welcome-hint">{t("projects.studio.empty.noProjectHint")}</p>

        <div className="ps-welcome-split">
          <div
            className="ps-welcome-paths"
            role="group"
            aria-label={t("projects.studio.empty.pathsAria")}
          >
            <button
              type="button"
              className="ps-welcome-path is-primary"
              onClick={onCreate}
              disabled={busy}
            >
              <span className="ps-welcome-path-icon" aria-hidden>
                <IconPlus size={16} />
              </span>
              <span className="ps-welcome-path-text">
                <span className="ps-welcome-path-title">
                  {t("projects.studio.empty.pathCreateTitle")}
                </span>
                <span className="ps-welcome-path-desc">
                  {t("projects.studio.empty.pathCreateDesc")}
                </span>
                <span className="ps-welcome-path-cmd">
                  {t("projects.studio.empty.pathCreateCmd")}
                </span>
              </span>
            </button>

            <button
              type="button"
              className="ps-welcome-path"
              onClick={onOpenExisting}
              disabled={busy}
            >
              <span className="ps-welcome-path-icon" aria-hidden>
                <IconFolder size={16} />
              </span>
              <span className="ps-welcome-path-text">
                <span className="ps-welcome-path-title">
                  {t("projects.studio.empty.pathOpenTitle")}
                </span>
                <span className="ps-welcome-path-desc">
                  {t("projects.studio.empty.pathOpenDesc")}
                </span>
                <span className="ps-welcome-path-cmd">
                  {t("projects.studio.empty.pathOpenCmd")}
                </span>
              </span>
            </button>
          </div>

          <aside
            className="ps-welcome-memo"
            aria-label={t("projects.studio.empty.memoAria")}
          >
            <p className="ps-welcome-memo-eyebrow">
              {t("projects.studio.empty.memoTitle")}
            </p>
            <p className="ps-welcome-memo-lead">
              {t("projects.studio.empty.memoLead")}
            </p>
            <ul className="ps-welcome-memo-list">
              {CATALOG_ITEMS.map((item) => (
                <li key={item}>
                  <code>{item}</code>
                </li>
              ))}
            </ul>
            <p className="ps-welcome-memo-eyebrow ps-welcome-memo-eyebrow--next">
              {t("projects.studio.empty.memoRouteTitle")}
            </p>
            <ol className="ps-welcome-memo-steps">
              <li>{t("projects.studio.empty.memoStep1")}</li>
              <li>{t("projects.studio.empty.memoStep2")}</li>
              <li>{t("projects.studio.empty.memoStep3")}</li>
            </ol>
          </aside>
        </div>
      </div>
    </section>
  );
}
