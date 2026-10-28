import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "../components/ModalCloseButton";
import { colorForLabel } from "../lib/labelColors";
import type { ClassStatRow } from "./types";
import {
  countSynonymRules,
  mapFromSynonymsByClass,
  MAX_SYNONYMS_PER_CLASS,
  synonymsByClassFromMap,
  type EquivalencesMap,
} from "./equivalences";

type Props = {
  open: boolean;
  classes: ClassStatRow[];
  equivalencesMap: EquivalencesMap;
  classColorOverrides: Record<string, string>;
  fileRel: string;
  onClose: () => void;
  onSave: (map: EquivalencesMap) => void;
};

export function TrainWizardSynonymsModal({
  open,
  classes,
  equivalencesMap,
  classColorOverrides,
  fileRel,
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const selected = useMemo(
    () => classes.filter((c) => c.selected),
    [classes],
  );
  const selectedIds = useMemo(() => selected.map((c) => c.id), [selected]);

  const [byClass, setByClass] = useState<Record<string, string[]>>({});
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const loaded = synonymsByClassFromMap(equivalencesMap, selectedIds);
    const capped: Record<string, string[]> = {};
    for (const id of selectedIds) {
      capped[id] = (loaded[id] ?? []).slice(0, MAX_SYNONYMS_PER_CLASS);
    }
    setByClass(capped);
    setDraftInputs({});
  }, [open, equivalencesMap, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const previewMap = useMemo(
    () => mapFromSynonymsByClass(byClass, selectedIds),
    [byClass, selectedIds],
  );
  const ruleCount = countSynonymRules(previewMap);

  const addSynonym = (classId: string) => {
    const raw = (draftInputs[classId] ?? "").trim();
    if (!raw) return;
    setByClass((prev) => {
      const list = [...(prev[classId] ?? [])];
      if (list.length >= MAX_SYNONYMS_PER_CLASS) return prev;
      if (list.includes(raw) || raw === classId) return prev;
      if (selectedIds.includes(raw)) return prev;
      return { ...prev, [classId]: [...list, raw].slice(0, MAX_SYNONYMS_PER_CLASS) };
    });
    setDraftInputs((prev) => ({ ...prev, [classId]: "" }));
  };

  const removeSynonym = (classId: string, raw: string) => {
    setByClass((prev) => ({
      ...prev,
      [classId]: (prev[classId] ?? []).filter((s) => s !== raw),
    }));
  };

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={PREDICT_APP_MODAL_OVERLAY_CLASS}
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="tw-syn-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tw-syn-modal-head">
            <div className="tw-syn-modal-titles">
              <h2 id={titleId}>{t("wizard.synonymsModalTitle")}</h2>
              <p className="tw-syn-modal-file font-mono">{fileRel}</p>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>

          <p className="tw-syn-modal-hint">{t("wizard.synonymsModalHint")}</p>

          <div className="tw-syn-modal-body">
            <div className="jobs-table-body tw-syn-table-body">
              <table className="jobs-table w-full text-left">
                <thead>
                  <tr>
                    <th className="tw-col-class">{t("wizard.colClass")}</th>
                    <th className="tw-col-count">{t("wizard.colCount")}</th>
                    <th className="tw-col-syn">{t("wizard.colSynonyms")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="jobs-table-placeholder">
                        {t("wizard.synonymsNoClasses")}
                      </td>
                    </tr>
                  ) : (
                    selected.map((row) => {
                      const swatch = colorForLabel(
                        row.id,
                        undefined,
                        classColorOverrides,
                      );
                      const chips = byClass[row.id] ?? [];
                      const atCap = chips.length >= MAX_SYNONYMS_PER_CLASS;
                      return (
                        <tr key={row.id} className="jobs-table-row">
                          <td className="tw-col-class">
                            <div className="tw-class-cell">
                              <span
                                className="tw-class-swatch"
                                style={{ backgroundColor: swatch }}
                                aria-hidden
                              />
                              <span className="font-mono">{row.id}</span>
                            </div>
                          </td>
                          <td className="tw-col-count">{row.count}</td>
                          <td className="tw-col-syn">
                            <div className="tw-syn-chips">
                              {chips.map((syn) => (
                                <span
                                  key={syn}
                                  className="tw-syn-chip tw-syn-chip--class"
                                  style={{ ["--syn-color" as string]: swatch }}
                                >
                                  {syn}
                                  <button
                                    type="button"
                                    aria-label={t("wizard.synonymRemove", {
                                      name: syn,
                                    })}
                                    onClick={() => removeSynonym(row.id, syn)}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                              {!atCap ? (
                                <input
                                  className="tw-input tw-syn-input"
                                  value={draftInputs[row.id] ?? ""}
                                  placeholder={t("wizard.synonymEmpty", {
                                    name: row.id,
                                  })}
                                  onChange={(e) =>
                                    setDraftInputs((prev) => ({
                                      ...prev,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addSynonym(row.id);
                                    }
                                  }}
                                  onBlur={() => addSynonym(row.id)}
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tw-syn-modal-foot">
            <span className="tw-eq-status">
              {t("wizard.synonymsStatus", { count: ruleCount })}
            </span>
            <div className="tw-syn-modal-actions">
              <button
                type="button"
                className="pp-btn pp-btn-preset"
                onClick={onClose}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                onClick={() => onSave(previewMap)}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}
