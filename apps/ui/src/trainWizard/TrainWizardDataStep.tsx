import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ClassSynonymsInline } from "./ClassSynonymsInline";
import {
  CLASS_COLOR_PRESETS,
  normalizeClassColor,
} from "../lib/classColors";
import { colorForLabel } from "../lib/labelColors";
import {
  formatDurationHm,
  sanitizeWizardDataPaths,
  wizardPathAbsolute,
} from "./defaults";
import type { ClassStatRow, TrainWizardDraft } from "./types";

type Props = {
  draft: TrainWizardDraft;
  setDraft: Dispatch<SetStateAction<TrainWizardDraft>>;
  projectDir: string;
  totalRec: number;
  annotated: number;
  skippedRec: number;
  selectedCalls: string[];
  disabledClasses: ClassStatRow[];
  synonymRuleCount: number;
  synonymsByClass: Record<string, string[]>;
  classColorOverrides: Record<string, string>;
  colorsEditable: boolean;
  colorPickerFor: string | null;
  setColorPickerFor: Dispatch<SetStateAction<string | null>>;
  setClassColor: (classId: string, color: string | null) => void;
  commitClassSynonyms: (classId: string, synonyms: string[]) => void;
  browsePath: (
    field: "recordingTableRel" | "annotationsRel" | "equivalencesRel",
  ) => void;
  onOpenSynonyms: () => void;
};

export function TrainWizardDataStep({
  draft,
  setDraft,
  projectDir,
  totalRec,
  annotated,
  skippedRec,
  selectedCalls,
  disabledClasses,
  synonymRuleCount,
  synonymsByClass,
  classColorOverrides,
  colorsEditable,
  colorPickerFor,
  setColorPickerFor,
  setClassColor,
  commitClassSynonyms,
  browsePath,
  onOpenSynonyms,
}: Props) {
  const { t } = useTranslation();
  const inheritedLocked = false;

  return (
    <div className="tw-data">
      <h2 className="tw-main-kicker">{t("wizard.step2Title")}</h2>
      <div className="tw-path-block">
        {(
          [
            {
              field: "recordingTableRel" as const,
              label: "recordingTable",
              hint: t("wizard.recordingTableHint", {
                total: totalRec,
                annotated,
                skipped: skippedRec,
              }),
            },
            {
              field: "annotationsRel" as const,
              label: "annotations",
              hint: t("wizard.annotationsHint"),
            },
          ] as const
        ).map((row) => (
          <div key={row.field} className="tw-path-row">
            <span className="tw-path-label">{t(`wizard.${row.label}`)}</span>
            <div className="tw-path-controls">
              <input
                className="tw-input tw-path-input"
                value={wizardPathAbsolute(projectDir, draft[row.field])}
                spellCheck={false}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    ...sanitizeWizardDataPaths(
                      {
                        recordingTableRel:
                          row.field === "recordingTableRel"
                            ? e.target.value
                            : d.recordingTableRel,
                        annotationsRel:
                          row.field === "annotationsRel"
                            ? e.target.value
                            : d.annotationsRel,
                        equivalencesRel: d.equivalencesRel,
                      },
                      projectDir,
                    ),
                  }))
                }
              />
              <button
                type="button"
                className="settings-path-btn"
                onClick={() => void browsePath(row.field)}
              >
                {t("settings.pathBrowse")}
              </button>
            </div>
            <span className="tw-path-hint">{row.hint}</span>
          </div>
        ))}
        <div className="tw-path-row">
          <span className="tw-path-label">{t("wizard.equivalences")}</span>
          <div className="tw-path-controls">
            <input
              className="tw-input tw-path-input"
              value={wizardPathAbsolute(projectDir, draft.equivalencesRel)}
              spellCheck={false}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  ...sanitizeWizardDataPaths(
                    {
                      recordingTableRel: d.recordingTableRel,
                      annotationsRel: d.annotationsRel,
                      equivalencesRel: e.target.value,
                    },
                    projectDir,
                  ),
                }))
              }
            />
            <button
              type="button"
              className="settings-path-btn"
              onClick={() => void browsePath("equivalencesRel")}
            >
              {t("settings.pathBrowse")}
            </button>
            <button
              type="button"
              className="settings-path-btn"
              onClick={() => onOpenSynonyms()}
            >
              {t("wizard.synonymsConfigure")}
            </button>
          </div>
          <span className="tw-path-hint">
            {synonymRuleCount > 0
              ? t("wizard.equivalencesHintConfigured", {
                  count: synonymRuleCount,
                })
              : t("wizard.equivalencesHint")}
          </span>
        </div>
      </div>

      <div className="tw-classes-section">
        <div className="tw-classes-head">
          <h3 className="tw-card-kicker">{t("wizard.classesTitle")}</h3>
          <span className="tw-muted">
            {t("wizard.classesSelected", {
              selected: selectedCalls.length,
              total: draft.classes.length,
            })}
          </span>
        </div>
        <div className="tw-classes-m16">
          <div className="jobs-table-body tw-classes-table-body">
            <table className="jobs-table w-full text-left">
              <thead>
                <tr>
                  <th className="tw-col-class">{t("wizard.colClass")}</th>
                  <th className="tw-col-syn">{t("wizard.colSynonymsShort")}</th>
                  <th className="tw-col-count">{t("wizard.colCount")}</th>
                  <th className="tw-col-num">{t("wizard.colRecordings")}</th>
                  <th className="tw-col-num">{t("wizard.colDuration")}</th>
                  <th className="tw-col-cov">{t("wizard.colCoverage")}</th>
                </tr>
              </thead>
              <tbody>
                {draft.classes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="jobs-table-placeholder">
                      {t("wizard.classesEmpty")}
                    </td>
                  </tr>
                ) : (
                  draft.classes.map((row) => {
                    const covPct = Math.round(
                      Math.max(0, Math.min(1, row.coverage)) * 100,
                    );
                    const dur = formatDurationHm(row.duration_sec);
                    const swatch = colorForLabel(
                      row.id,
                      undefined,
                      classColorOverrides,
                    );
                    const hasOverride = Boolean(
                      classColorOverrides[row.id] ??
                        classColorOverrides[row.id.toUpperCase()],
                    );
                    const pickerOpen = colorPickerFor === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={clsx(
                          "jobs-table-row",
                          row.selected && "jobs-table-row-selected",
                        )}
                      >
                        <td className="tw-col-class">
                          <div className="tw-class-cell">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={inheritedLocked}
                              title={
                                inheritedLocked
                                  ? t("wizard.finetuneInherited")
                                  : undefined
                              }
                              onChange={() =>
                                setDraft((d) => ({
                                  ...d,
                                  classes: d.classes.map((c) =>
                                    c.id === row.id
                                      ? { ...c, selected: !c.selected }
                                      : c,
                                  ),
                                }))
                              }
                            />
                            <span className="tw-class-swatch-wrap">
                              <button
                                type="button"
                                className={clsx(
                                  "tw-class-swatch",
                                  colorsEditable && "is-editable",
                                  hasOverride && "is-custom",
                                )}
                                style={{ backgroundColor: swatch }}
                                disabled={!colorsEditable}
                                title={
                                  colorsEditable
                                    ? t("wizard.colorPickHint")
                                    : t("wizard.colorLockedHint")
                                }
                                aria-label={t("wizard.colorPickAria", {
                                  name: row.id,
                                })}
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (!colorsEditable) return;
                                  setColorPickerFor((cur) =>
                                    cur === row.id ? null : row.id,
                                  );
                                }}
                              />
                              {pickerOpen ? (
                                <div className="tw-color-pop" role="dialog">
                                  <div className="tw-color-pop-grid">
                                    {CLASS_COLOR_PRESETS.map((hex) => {
                                      const n = normalizeClassColor(hex) ?? hex;
                                      const selected =
                                        n.toUpperCase() === swatch.toUpperCase();
                                      return (
                                        <button
                                          key={n}
                                          type="button"
                                          className={clsx(
                                            "tw-color-swatch-opt",
                                            selected && "is-selected",
                                          )}
                                          style={{ backgroundColor: n }}
                                          title={n}
                                          onClick={() => {
                                            setClassColor(row.id, n);
                                            setColorPickerFor(null);
                                          }}
                                        />
                                      );
                                    })}
                                  </div>
                                  <button
                                    type="button"
                                    className="tw-color-reset"
                                    disabled={!hasOverride}
                                    onClick={() => {
                                      setClassColor(row.id, null);
                                      setColorPickerFor(null);
                                    }}
                                  >
                                    {t("wizard.colorReset")}
                                  </button>
                                </div>
                              ) : null}
                            </span>
                            <span className="font-mono">{row.id}</span>
                          </div>
                        </td>
                        <td className="tw-col-syn">
                          <ClassSynonymsInline
                            classId={row.id}
                            color={swatch}
                            synonyms={synonymsByClass[row.id] ?? []}
                            reservedClassIds={draft.classes.map((c) => c.id)}
                            onCommit={(next) =>
                              commitClassSynonyms(row.id, next)
                            }
                          />
                        </td>
                        <td className="tw-col-count">{row.count}</td>
                        <td className="tw-col-num">{row.recordings}</td>
                        <td className="tw-col-num">
                          {dur
                            ? t("wizard.durationHm", {
                                h: dur.h,
                                m: dur.m,
                              })
                            : "—"}
                        </td>
                        <td className="tw-col-cov">
                          <span className="tw-cov">
                            <span
                              className={clsx(
                                "tw-cov-fill",
                                covPct < 35 && "is-warn",
                              )}
                              style={{ width: `${covPct}%` }}
                            />
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {disabledClasses.length ? (
          <p className="tw-warn tw-warn-icon">
            {t("wizard.classDisabled", {
              name: disabledClasses.map((c) => c.id).join(", "),
              count: disabledClasses.reduce((n, c) => n + c.count, 0),
              recordings: disabledClasses.reduce(
                (n, c) => n + c.recordings,
                0,
              ),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
