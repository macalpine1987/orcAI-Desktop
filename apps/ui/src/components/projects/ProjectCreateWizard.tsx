import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { PROJECT_FOCUSES, type ProjectFocus } from "../../api/projects";
import { slugifyProjectName } from "../../lib/projectName";
import { focusCommandHint, wizardProjectDir } from "../../lib/projectsStudio";

export type WizardPhase = "form" | "creating" | "waiting_engine" | "init";

type Props = {
  focus: ProjectFocus;
  displayName: string;
  parentDir: string;
  phase: WizardPhase;
  busy: boolean;
  sidecarOnline: boolean;
  error: string | null;
  onFocus: (focus: ProjectFocus) => void;
  onDisplayName: (v: string) => void;
  onPickParent: () => void;
  onCancel: () => void;
  onNext: () => void;
};

/** m32 «Создать проект»: three soft-focus cards, name + folder, «Далее · init». */
export function ProjectCreateWizard({
  focus,
  displayName,
  parentDir,
  phase,
  busy,
  sidecarOnline,
  error,
  onFocus,
  onDisplayName,
  onPickParent,
  onCancel,
  onNext,
}: Props) {
  const { t } = useTranslation();
  const slug = slugifyProjectName(displayName.trim());
  const dirPreview = wizardProjectDir(parentDir, slug);
  const inProgress = phase !== "form";

  const progressText =
    phase === "waiting_engine"
      ? t("projects.studio.wizard.initWaiting")
      : phase === "init"
        ? t("projects.studio.wizard.initRunning", { name: slug || displayName })
        : phase === "creating"
          ? t("projects.wizard.finishing")
          : null;

  return (
    <div className="ps-wizard-frame">
      <section className="ps-wizard" aria-labelledby="ps-wizard-title">
        <p className="ps-eyebrow">{t("projects.studio.wizard.eyebrow")}</p>
        <h2 id="ps-wizard-title" className="ps-wizard-title">
          {inProgress
            ? t("projects.studio.wizard.stepInitTitle")
            : t("projects.studio.wizard.title")}
        </h2>
        <p className="ps-wizard-subtitle">{t("projects.studio.wizard.subtitle")}</p>

        {inProgress ? (
          <div className="ps-wizard-progress" role="status">
            <span className="ps-lamp is-warn" aria-hidden />
            <span>{progressText}</span>
          </div>
        ) : (
          <>
            <div
              className="ps-focus-grid"
              role="radiogroup"
              aria-label={t("projects.studio.wizard.focusAria")}
            >
              {PROJECT_FOCUSES.map((f) => {
                const selected = f === focus;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={clsx("ps-focus-card", selected && "is-selected")}
                    onClick={() => onFocus(f)}
                  >
                    <span className="ps-focus-card-head">
                      <span className="ps-radio" aria-hidden />
                      {t(`projects.studio.wizard.${f}Title`)}
                    </span>
                    <p className="ps-focus-card-hint">{t(`projects.studio.wizard.${f}Hint`)}</p>
                    <span className="ps-focus-card-cmd">{focusCommandHint(f)}</span>
                  </button>
                );
              })}
            </div>

            <div className="ps-wizard-fields">
              <label className="ps-wizard-field">
                <span className="ps-field-label">{t("projects.studio.wizard.name")}</span>
                <input
                  type="text"
                  className="ps-input"
                  value={displayName}
                  placeholder={t("projects.studio.wizard.namePlaceholder")}
                  onChange={(e) => onDisplayName(e.target.value)}
                  autoFocus
                />
              </label>
              <div className="ps-wizard-field">
                <span className="ps-field-label">{t("projects.studio.wizard.dir")}</span>
                <div className="ps-input-row">
                  <input
                    type="text"
                    className="ps-input is-mono"
                    readOnly
                    value={dirPreview}
                    placeholder={t("projects.studio.wizard.dirPlaceholder")}
                    title={dirPreview}
                    onClick={onPickParent}
                  />
                  <button type="button" className="ps-btn" onClick={onPickParent}>
                    {t("projects.studio.wizard.pickDir")}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {error ? <p className="mt-3 text-xs ps-text-err">{error}</p> : null}

        <div className="ps-wizard-actions">
          <button type="button" className="ps-btn" onClick={onCancel}>
            {t("projects.studio.wizard.cancel")}
          </button>
          {!inProgress ? (
            <button
              type="button"
              className="ps-btn ps-btn-primary"
              onClick={onNext}
              disabled={busy || !displayName.trim() || !parentDir.trim() || !sidecarOnline}
              title={!sidecarOnline ? t("projects.studio.actions.needsSidecar") : undefined}
            >
              {t("projects.studio.wizard.next")}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
