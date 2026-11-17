import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  FACTORY_SPECTRO,
  parseWizardNumber,
  splitSumOk,
} from "./defaults";
import {
  formatFinetuneArchLine,
  formatFinetuneInputLine,
  formatFinetuneSpectroLine,
} from "./finetune";
import type { TrainWizardDraft } from "./types";

type Props = {
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  inheritedLocked: boolean;
  locale: "ru" | "en";
  /** Snippet estimate for unlocked spectro footer. */
  est: { snippets: number; gb: number; minutes: number } | null;
};

export function TrainWizardSpectroStep({
  draft,
  setDraft,
  inheritedLocked,
  locale,
  est,
}: Props) {
  const { t } = useTranslation();

  if (inheritedLocked) {
    return (
      <div className="tw-spectro tw-ft-spectro-locked">
        <h2 className="tw-main-kicker">{t("wizard.step3Title")}</h2>
        <p className="tw-warn">{t("wizard.finetuneSpectroLockedHint")}</p>
        <div className="tw-ft-inherit" role="group">
          <div className="tw-ft-inherit-head">
            <svg
              className="tw-ft-lock-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden
            >
              <path
                fill="currentColor"
                d="M8 1.5A2.75 2.75 0 0 0 5.25 4.25V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.75V4.25A2.75 2.75 0 0 0 8 1.5Zm1.25 4.5h-2.5V4.25a1.25 1.25 0 1 1 2.5 0V6Z"
              />
            </svg>
            <span>{t("wizard.finetuneInheritedTitle")}</span>
          </div>
          <dl className="tw-ft-inherit-grid">
            <div>
              <dt>{t("wizard.finetuneInheritSpectro")}</dt>
              <dd>{formatFinetuneSpectroLine(draft.spectro, locale)}</dd>
            </div>
            <div>
              <dt>{t("wizard.finetuneInheritInput")}</dt>
              <dd>{formatFinetuneInputLine(draft.spectro, locale)}</dd>
            </div>
            <div>
              <dt>{t("wizard.finetuneInheritArch")}</dt>
              <dd>{formatFinetuneArchLine(draft.model, locale)}</dd>
            </div>
          </dl>
        </div>
        <div className="tw-param-section">
          <h3 className="tw-card-kicker">{t("wizard.split")}</h3>
          <div className="tw-param-rows">
            <div className="tw-param-row tw-param-row-split">
              <span className="tw-param-label">{t("wizard.split")}</span>
              <div className="tw-split-controls">
                <div className="tw-split-bar is-labeled" aria-hidden>
                  <span
                    className="is-train"
                    style={{ flex: Math.max(0.01, draft.spectro.train) }}
                  >
                    train {draft.spectro.train}
                  </span>
                  <span
                    className="is-val"
                    style={{ flex: Math.max(0.01, draft.spectro.val) }}
                  >
                    val {draft.spectro.val}
                  </span>
                  <span
                    className="is-test"
                    style={{ flex: Math.max(0.01, draft.spectro.test) }}
                  >
                    test {draft.spectro.test}
                  </span>
                </div>
                {(
                  [
                    ["train", "train"],
                    ["val", "val"],
                    ["test", "test"],
                  ] as const
                ).map(([key]) => (
                  <input
                    key={key}
                    className="tw-input tw-param-input tw-split-num"
                    type="number"
                    step="0.01"
                    aria-label={key}
                    value={draft.spectro[key]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        spectro: {
                          ...d.spectro,
                          [key]: parseWizardNumber(e.target.value, d.spectro[key]),
                        },
                      }))
                    }
                  />
                ))}
                <span
                  className={clsx(
                    "tw-param-hint tw-split-sum",
                    !splitSumOk(draft.spectro) && "tw-error",
                  )}
                >
                  {t("wizard.splitSum", {
                    sum: (
                      draft.spectro.train +
                      draft.spectro.val +
                      draft.spectro.test
                    ).toFixed(1),
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

    );
  }

  return (
    <div className="tw-spectro">
      <div className="tw-form-head">
        <h2 className="tw-main-kicker">{t("wizard.step3Title")}</h2>
        <button
          type="button"
          className="tw-reset-btn"
          onClick={() =>
            setDraft((d) => ({ ...d, spectro: { ...FACTORY_SPECTRO } }))
          }
        >
          {t("wizard.resetDefaults")}
        </button>
      </div>

      <div className="tw-param-section">
        <h3 className="tw-card-kicker">{t("wizard.spectroSection")}</h3>
        <div className="tw-param-rows">
          {(
            [
              ["sampling_rate", "samplingRate"],
              ["nfft", "nfft"],
              ["n_overlap", "overlap"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="tw-param-row">
              <span className="tw-param-label">{t(`wizard.${label}`)}</span>
              <input
                className="tw-input tw-param-input"
                type="number"
                value={draft.spectro[key]}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    spectro: { ...d.spectro, [key]: parseWizardNumber(e.target.value, d.spectro[key]) },
                  }))
                }
              />
              <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
            </label>
          ))}
          <div className="tw-param-row tw-param-row-range">
            <span className="tw-param-label">{t("wizard.freqRange")}</span>
            <span className="tw-param-range">
              <input
                className="tw-input tw-param-input"
                type="number"
                value={draft.spectro.freq_low}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    spectro: {
                      ...d.spectro,
                      freq_low: parseWizardNumber(e.target.value, d.spectro.freq_low),
                    },
                  }))
                }
              />
              <span className="tw-param-dash" aria-hidden>
                —
              </span>
              <input
                className="tw-input tw-param-input"
                type="number"
                value={draft.spectro.freq_high}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    spectro: {
                      ...d.spectro,
                      freq_high: parseWizardNumber(e.target.value, d.spectro.freq_high),
                    },
                  }))
                }
              />
            </span>
            <span className="tw-param-hint">{t("wizard.freqRangeHint")}</span>
          </div>
          <div className="tw-param-row tw-param-row-range">
            <span className="tw-param-label">{t("wizard.quantiles")}</span>
            <span className="tw-param-range">
              <input
                className="tw-input tw-param-input"
                type="number"
                step="0.001"
                value={draft.spectro.quantile_low}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    spectro: {
                      ...d.spectro,
                      quantile_low: parseWizardNumber(e.target.value, d.spectro.quantile_low),
                    },
                  }))
                }
              />
              <span className="tw-param-dash" aria-hidden>
                —
              </span>
              <input
                className="tw-input tw-param-input"
                type="number"
                step="0.001"
                value={draft.spectro.quantile_high}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    spectro: {
                      ...d.spectro,
                      quantile_high: parseWizardNumber(e.target.value, d.spectro.quantile_high),
                    },
                  }))
                }
              />
            </span>
            <span className="tw-param-hint">{t("wizard.quantilesHint")}</span>
          </div>
        </div>
      </div>

      <div className="tw-param-section">
        <h3 className="tw-card-kicker">{t("wizard.snippetsSection")}</h3>
        <div className="tw-param-rows">
          {(
            [
              ["snippet_duration", "snippetDuration"],
              ["snippets_per_sec", "snippetsPerSec"],
              ["segment_duration", "segmentDuration"],
              ["fraction_removal", "fractionRemoval"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="tw-param-row">
              <span className="tw-param-label">{t(`wizard.${label}`)}</span>
              <input
                className="tw-input tw-param-input"
                type="number"
                step={key === "fraction_removal" ? "0.01" : undefined}
                value={draft.spectro[key]}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    spectro: { ...d.spectro, [key]: parseWizardNumber(e.target.value, d.spectro[key]) },
                  }))
                }
              />
              <span className="tw-param-hint">{t(`wizard.${label}Hint`)}</span>
            </label>
          ))}
          <div className="tw-param-row tw-param-row-split">
            <span className="tw-param-label">{t("wizard.split")}</span>
            <div className="tw-split-controls">
              <div className="tw-split-bar is-labeled" aria-hidden>
                <span
                  className="is-train"
                  style={{ flex: Math.max(0.01, draft.spectro.train) }}
                >
                  train {draft.spectro.train}
                </span>
                <span
                  className="is-val"
                  style={{ flex: Math.max(0.01, draft.spectro.val) }}
                >
                  val {draft.spectro.val}
                </span>
                <span
                  className="is-test"
                  style={{ flex: Math.max(0.01, draft.spectro.test) }}
                >
                  test {draft.spectro.test}
                </span>
              </div>
              {(
                [
                  ["train", "train"],
                  ["val", "val"],
                  ["test", "test"],
                ] as const
              ).map(([key]) => (
                <input
                  key={key}
                  className="tw-input tw-param-input tw-split-num"
                  type="number"
                  step="0.01"
                  aria-label={key}
                  value={draft.spectro[key]}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      spectro: {
                        ...d.spectro,
                        [key]: parseWizardNumber(e.target.value, d.spectro[key]),
                      },
                    }))
                  }
                />
              ))}
              <span
                className={clsx(
                  "tw-param-hint tw-split-sum",
                  !splitSumOk(draft.spectro) && "tw-error",
                )}
              >
                {t("wizard.splitSum", {
                  sum: (
                    draft.spectro.train +
                    draft.spectro.val +
                    draft.spectro.test
                  ).toFixed(1),
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {est ? (
        <p className="tw-estimate">
          {t("wizard.spectroEstimate", {
            snippets: est.snippets.toLocaleString(locale),
            gb: est.gb,
            minutes: est.minutes,
          })}
        </p>
      ) : null}
    </div>

  );
}
