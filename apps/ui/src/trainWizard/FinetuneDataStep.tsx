/** m13 step 2 — base model + locked inheritance + class status. */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { OrcaiModel } from "../api/models";
import { colorForLabel } from "../lib/labelColors";
import { formatBytesLocalized } from "../lib/trainPipeline";
import {
  finetuneBaseSharesExamples,
  finetuneClassStatus,
  finetuneClassesWithoutExamples,
  finetuneHasNoNewExamples,
  formatFinetuneArchLine,
  formatFinetuneInputLine,
  formatFinetuneSpectroLine,
} from "./finetune";
import type { ClassStatRow, ModelFields, SpectroFields } from "./types";

type Props = {
  catalogModels: OrcaiModel[];
  /** Annotation class ids with examples. ``null`` until that scan has finished. */
  exampleClassIds: readonly string[] | null;
  baseModel: string | null;
  classes: ClassStatRow[];
  spectro: SpectroFields;
  model: ModelFields;
  recordingTableRel: string;
  recordingTableAbs: string;
  dataHint: string;
  locale: "ru" | "en";
  classColorOverrides?: Record<string, string>;
  applyStatus?: "idle" | "loading" | "ready" | "error";
  onBaseChange: (value: string | null) => void;
  onBrowseTable: () => void;
  onTableChange: (value: string) => void;
};

function LockGlyph() {
  return (
    <svg
      className="tw-ft-lock-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M8 1.5A2.75 2.75 0 0 0 5.25 4.25V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.75V4.25A2.75 2.75 0 0 0 8 1.5Zm1.25 4.5h-2.5V4.25a1.25 1.25 0 1 1 2.5 0V6Z"
      />
    </svg>
  );
}

export function FinetuneDataStep({
  catalogModels,
  exampleClassIds,
  baseModel,
  classes,
  spectro,
  model,
  recordingTableRel,
  recordingTableAbs,
  dataHint,
  locale,
  classColorOverrides,
  applyStatus = "idle",
  onBaseChange,
  onBrowseTable,
  onTableChange,
}: Props) {
  const { t } = useTranslation();
  const builtins = useMemo(
    () => catalogModels.filter((m) => m.kind === "builtin"),
    [catalogModels],
  );
  const trained = useMemo(
    () => catalogModels.filter((m) => m.kind === "trained"),
    [catalogModels],
  );
  const modelBlocked = (m: OrcaiModel) =>
    exampleClassIds !== null && !finetuneBaseSharesExamples(m.calls, exampleClassIds);
  const anyBlocked = catalogModels.some(modelBlocked);
  const selected = catalogModels.find(
    (m) => m.path === baseModel || m.id === baseModel,
  );
  const selectValue = selected ? selected.path || selected.id : baseModel ?? "";
  const classIds = classes.map((c) => c.id);
  const missingExamples = finetuneClassesWithoutExamples(classes);
  const noneAll = finetuneHasNoNewExamples(classes);
  const baseMeta = selected
    ? [
        selected.kind === "builtin"
          ? t("models.kindBuiltinShort")
          : t("models.kindProject"),
        selected.size_bytes != null && selected.size_bytes > 0
          ? formatBytesLocalized(selected.size_bytes, locale)
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="tw-ft-data">
      <h2 className="tw-main-kicker">{t("wizard.finetuneStep2Title")}</h2>

      <div className="tw-ft-base-row">
        <span className="tw-ft-base-label">{t("wizard.finetuneBase")}</span>
        <select
          className="tw-input tw-ft-base-select"
          value={selectValue}
          onChange={(e) => onBaseChange(e.target.value || null)}
        >
          <option value="">{t("wizard.finetuneBasePick")}</option>
          {builtins.length ? (
            <optgroup label={t("wizard.finetuneBuiltinGroup")}>
              {builtins.map((m) => {
                const value = m.path || m.id;
                const blocked = modelBlocked(m);
                return (
                  <option key={value} value={value} disabled={blocked}>
                    {blocked
                      ? `${m.name} — ${t("wizard.finetuneNoSharedClasses")}`
                      : m.name}
                  </option>
                );
              })}
            </optgroup>
          ) : null}
          {trained.length ? (
            <optgroup label={t("wizard.finetuneTrainedGroup")}>
              {trained.map((m) => {
                const value = m.path || m.id;
                const blocked = modelBlocked(m);
                return (
                  <option key={value} value={value} disabled={blocked}>
                    {blocked
                      ? `${m.name} — ${t("wizard.finetuneNoSharedClasses")}`
                      : m.name}
                  </option>
                );
              })}
            </optgroup>
          ) : (
            <optgroup label={t("wizard.finetuneTrainedGroup")}>
              <option value="" disabled>
                {t("wizard.finetuneTrainedEmpty")}
              </option>
            </optgroup>
          )}
        </select>
        <span className="tw-ft-base-meta">
          {applyStatus === "loading"
            ? t("wizard.finetuneApplying")
            : baseMeta || t("wizard.finetuneNeedBase")}
        </span>
        {anyBlocked ? (
          <p className="tw-ft-base-note">{t("wizard.finetuneNoSharedClassesNote")}</p>
        ) : null}
      </div>

      <div
        className="tw-ft-inherit"
        role="group"
        aria-label={t("wizard.finetuneInheritedTitle")}
      >
        <div className="tw-ft-inherit-head">
          <LockGlyph />
          <span>{t("wizard.finetuneInheritedTitle")}</span>
        </div>
        {baseModel && classIds.length ? (
          <dl className="tw-ft-inherit-grid">
            <div>
              <dt>{t("wizard.finetuneInheritClasses", { count: classIds.length })}</dt>
              <dd className="tw-ft-inherit-calls">{classIds.join(" · ")}</dd>
            </div>
            <div>
              <dt>{t("wizard.finetuneInheritSpectro")}</dt>
              <dd>{formatFinetuneSpectroLine(spectro, locale)}</dd>
            </div>
            <div>
              <dt>{t("wizard.finetuneInheritInput")}</dt>
              <dd>{formatFinetuneInputLine(spectro, locale)}</dd>
            </div>
            <div>
              <dt>{t("wizard.finetuneInheritArch")}</dt>
              <dd>{formatFinetuneArchLine(model, locale)}</dd>
            </div>
          </dl>
        ) : (
          <p className="tw-ft-inherit-empty">{t("wizard.finetuneInheritEmpty")}</p>
        )}
        <p className="tw-ft-inherit-foot">{t("wizard.finetuneInheritedFoot")}</p>
      </div>

      <div className="tw-ft-newdata">
        <h3 className="tw-card-kicker">{t("wizard.finetuneNewData")}</h3>
        <div className="tw-path-row">
          <span className="tw-path-label">{t("wizard.recordingTable")}</span>
          <div className="tw-path-controls">
            <input
              className="tw-input tw-path-input"
              value={recordingTableAbs || recordingTableRel}
              spellCheck={false}
              aria-label={t("wizard.recordingTable")}
              onChange={(e) => onTableChange(e.target.value)}
            />
            <button type="button" className="settings-path-btn" onClick={onBrowseTable}>
              {t("settings.pathBrowse")}
            </button>
          </div>
          <span className="tw-path-hint">
            {recordingTableRel ? dataHint : t("wizard.recordingTableHintEmpty")}
          </span>
        </div>
      </div>

      {missingExamples.length && applyStatus === "ready" ? (
        <p className={clsx("tw-warn", noneAll && "tw-warn-icon")}>
          {t("wizard.finetuneNoExamples", {
            names: missingExamples.map((c) => c.id).join(", "),
          })}
        </p>
      ) : null}

      <div className="tw-ft-status-section">
        <div className="tw-classes-m16 tw-ft-status-table">
          <div className="jobs-table-body tw-classes-table-body">
            <table className="jobs-table w-full text-left">
              <thead>
                <tr>
                  <th className="tw-col-class">{t("wizard.colClassBase")}</th>
                  <th className="tw-col-count">{t("wizard.colCountNew")}</th>
                  <th className="tw-col-status">{t("wizard.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {!baseModel ? (
                  <tr>
                    <td colSpan={3} className="jobs-table-placeholder">
                      {t("wizard.finetuneNeedBase")}
                    </td>
                  </tr>
                ) : classes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="jobs-table-placeholder">
                      {applyStatus === "loading"
                        ? t("wizard.finetuneApplying")
                        : t("wizard.finetuneInheritEmpty")}
                    </td>
                  </tr>
                ) : (
                  classes.map((row) => {
                    const status = finetuneClassStatus(row.count);
                    const swatch = colorForLabel(row.id, undefined, classColorOverrides);
                    return (
                      <tr key={row.id} className="jobs-table-row">
                        <td className="tw-col-class">
                          <span className="tw-ft-class-cell">
                            <span
                              className="tw-ft-class-swatch"
                              style={{ backgroundColor: swatch }}
                              aria-hidden
                            />
                            <span className="tw-ft-class-id">{row.id}</span>
                          </span>
                        </td>
                        <td className="tw-col-count">
                          {row.count.toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}
                        </td>
                        <td className="tw-col-status">
                          <span
                            className={clsx(
                              "tw-ft-status",
                              status === "ok" && "is-ok",
                              status === "few" && "is-few",
                              status === "none" && "is-none",
                            )}
                          >
                            <span className="tw-ft-status-dot" aria-hidden />
                            {t(`wizard.finetuneStatus.${status}`)}
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
      </div>
    </div>
  );
}
