import { useTranslation } from "react-i18next";
import { WIZARD_STEP_IDS, type TrainWizardDraft, type WizardStepId } from "./types";

type Props = {
  draft: TrainWizardDraft;
  inheritedLocked: boolean;
  idx: number;
  planFullLength: number;
  launchBlockedReason: string | null;
  nextBlockedReason: string | null;
  canLaunch: boolean;
  busy: boolean;
  canNext: boolean;
  cmdPreview: string;
  cliCopied: boolean;
  onCopyCli: () => void;
  onClose: () => void;
  go: (step: WizardStepId) => void;
  onSaveDraft: () => void;
  onOpenParamsJson: () => void;
  onLaunch: (prepOnly: boolean) => void;
  onNext: () => void;
};

export function TrainWizardFooter({
  draft,
  inheritedLocked,
  idx,
  planFullLength,
  launchBlockedReason,
  nextBlockedReason,
  canLaunch,
  busy,
  canNext,
  cmdPreview,
  cliCopied,
  onCopyCli,
  onClose,
  go,
  onSaveDraft,
  onOpenParamsJson,
  onLaunch,
  onNext,
}: Props) {
  const { t } = useTranslation();

  return (
    <footer className="pp-footer tw-footer">
      <div className="pp-footer-main">
        {draft.step === "preflight" ? (
          <div className="pp-footer-cmd tw-footer-will">
            <p className="pp-cmd-label">{t("wizard.willRunLabel")}</p>
            <p className="tw-will-run">
              {t("wizard.willRunDetail", { count: planFullLength })}
            </p>
            {launchBlockedReason ? (
              <p className="tw-error tw-launch-block">{launchBlockedReason}</p>
            ) : null}
          </div>
        ) : (
          <div className="pp-footer-cmd">
            <p className="pp-cmd-label">{t("predict.run.cliTitle")}</p>
            <div className="pp-cmd-row">
              <pre
                className={cmdPreview ? "pp-cmd-lcd" : "pp-cmd-lcd is-empty"}
                title={cmdPreview || undefined}
                aria-label={
                  cmdPreview
                    ? t("predict.run.cliTitle")
                    : t("predict.run.cliEmpty")
                }
              >
                {cmdPreview || t("predict.run.cliEmpty")}
              </pre>
              <button
                type="button"
                className="pp-btn pp-btn-preset pp-cmd-copy"
                disabled={busy || !cmdPreview.trim()}
                onClick={() => void onCopyCli()}
              >
                {cliCopied
                  ? t("predict.run.cliCopied")
                  : t("predict.run.cliCopy")}
              </button>
            </div>
          </div>
        )}
        <div className="pp-footer-side">
          <span className="pp-footer-count">
            {inheritedLocked
              ? t("wizard.stepOfFinetune", {
                  n: idx + 1,
                  total: WIZARD_STEP_IDS.length,
                })
              : t("wizard.stepOf", {
                  n: idx + 1,
                  total: WIZARD_STEP_IDS.length,
                })}
          </span>
          <div className="pp-footer-btns">
            {draft.step === "scenario" ? (
              <button
                type="button"
                className="pp-btn pp-btn-preset"
                disabled={busy}
                onClick={() => onClose()}
              >
                {t("wizard.cancel")}
              </button>
            ) : (
              <button
                type="button"
                className="pp-btn pp-btn-preset"
                disabled={busy}
                onClick={() => go(WIZARD_STEP_IDS[idx - 1]!)}
              >
                {t("wizard.back")}
              </button>
            )}
            {draft.step === "data" && !inheritedLocked ? (
              <button
                type="button"
                className="pp-btn pp-btn-preset"
                disabled={busy}
                onClick={() => void onSaveDraft()}
              >
                {t("wizard.saveDraft")}
              </button>
            ) : null}
            {draft.step === "model" ? (
              <button
                type="button"
                className="pp-btn pp-btn-preset"
                disabled={busy}
                onClick={() => onOpenParamsJson()}
              >
                {t("wizard.openJson")}
              </button>
            ) : null}
            {draft.step === "preflight" ? (
              <>
                <button
                  type="button"
                  className="pp-btn pp-btn-preset"
                  disabled={!canLaunch}
                  title={launchBlockedReason ?? undefined}
                  onClick={() => void onLaunch(true)}
                >
                  {t("wizard.prepOnly")}
                </button>
                <button
                  type="button"
                  className="pp-btn pp-btn-primary"
                  disabled={!canLaunch}
                  title={launchBlockedReason ?? undefined}
                  onClick={() => void onLaunch(false)}
                >
                  {t("wizard.startTrain")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                disabled={!canNext}
                title={nextBlockedReason ?? undefined}
                onClick={onNext}
              >
                {t("wizard.next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
