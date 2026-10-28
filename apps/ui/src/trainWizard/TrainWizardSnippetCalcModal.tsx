import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  calculateProjectSnippets,
  type SnippetCalculatorResult,
  type SnippetSplitId,
} from "../api/projects";
import { isAbortError } from "../lib/fetchErrors";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "../components/ModalCloseButton";
import { draftToParameterJson } from "./defaults";
import { ensureIdentity } from "./equivalences";
import {
  snippetCalcCanApply,
  snippetDemandExceedsInventory,
  snippetSplitsWithoutBatch,
} from "./snippetCalc";
import type { TrainWizardDraft } from "./types";

export type SnippetBatches = Record<SnippetSplitId, number>;

type Props = {
  open: boolean;
  projectId: string | null;
  draft: TrainWizardDraft;
  onClose: () => void;
  onApply: (batches: SnippetBatches) => void;
};

const SPLITS: SnippetSplitId[] = ["train", "val", "test"];

const CURRENT_KEY: Record<SnippetSplitId, "n_batch_train" | "n_batch_val" | "n_batch_test"> = {
  train: "n_batch_train",
  val: "n_batch_val",
  test: "n_batch_test",
};

export function TrainWizardSnippetCalcModal({
  open,
  projectId,
  draft,
  onClose,
  onApply,
}: Props) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const locale = i18n.language.startsWith("ru") ? "ru-RU" : "en-US";
  const [result, setResult] = useState<SnippetCalculatorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const run = useCallback(
    async (signal?: AbortSignal) => {
      if (!projectId) return;
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const param = draftToParameterJson(draft) as {
          calls: string[];
          snippets: Record<string, number>;
          seed: number;
        };
        const next = await calculateProjectSnippets(
          projectId,
          {
            calls: param.calls,
            equivalences: ensureIdentity(draft.equivalencesMap, param.calls),
            snippets: param.snippets,
            batch_size: draft.model.batch_size,
            seed: param.seed,
          },
          signal,
        );
        if (requestSeq.current !== seq) return;
        setResult(next);
      } catch (err) {
        if (requestSeq.current !== seq || isAbortError(err)) return;
        setResult(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (requestSeq.current === seq) setLoading(false);
      }
    },
    [projectId, draft],
  );

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setResult(null);
    void run(ctrl.signal);
    return () => {
      requestSeq.current += 1;
      ctrl.abort();
    };
    // Recalculate only when the modal opens; «Recalculate» covers later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  if (!open) return null;

  const fmt = (n: number) => n.toLocaleString(locale);
  const batchSize = draft.model.batch_size;
  const noBatch = snippetSplitsWithoutBatch(result);
  const canApply = snippetCalcCanApply(result, loading);

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
          className="tw-syn-modal tw-calc-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tw-syn-modal-head">
            <div className="tw-syn-modal-titles">
              <h2 id={titleId}>{t("wizard.calcTitle")}</h2>
              <p className="tw-syn-modal-file font-mono">
                {result
                  ? t(
                      result.source === "measured"
                        ? "wizard.calcSourceMeasured"
                        : "wizard.calcSourceEstimate",
                    )
                  : t("wizard.calcSourcePending")}
              </p>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>

          <p className="tw-syn-modal-hint">
            {t("wizard.calcHint", { batchSize: fmt(batchSize) })}
          </p>

          <div className="tw-syn-modal-body">
            <div className="jobs-table-body tw-syn-table-body">
              <table className="jobs-table w-full text-left">
                <thead>
                  <tr>
                    <th className="tw-col-class">{t("wizard.calcColSplit")}</th>
                    <th className="tw-col-num">{t("wizard.calcColCut")}</th>
                    <th className="tw-col-num">{t("wizard.calcColLabelled")}</th>
                    <th className="tw-col-num">{t("wizard.calcColKept")}</th>
                    <th className="tw-col-num">{t("wizard.calcColNeeded")}</th>
                    <th className="tw-col-num">{t("wizard.calcColMax")}</th>
                    <th className="tw-col-num">{t("wizard.calcColSuggested")}</th>
                  </tr>
                </thead>
                <tbody>
                  {!result ? (
                    <tr>
                      <td colSpan={7} className="jobs-table-placeholder">
                        {loading ? t("wizard.calcLoading") : error ?? t("wizard.calcEmpty")}
                      </td>
                    </tr>
                  ) : (
                    SPLITS.map((split) => {
                      const row = result.splits[split];
                      const current = draft.model[CURRENT_KEY[split]];
                      const needed = current * batchSize;
                      const short = snippetDemandExceedsInventory(
                        current,
                        batchSize,
                        row.available,
                      );
                      return (
                        <tr key={split} className="jobs-table-row">
                          <td className="tw-col-class">{t(`wizard.calcSplit.${split}`)}</td>
                          <td className="tw-col-num">{fmt(row.total)}</td>
                          <td className="tw-col-num">{fmt(row.labelled)}</td>
                          <td className="tw-col-num">
                            {fmt(row.available)}
                            {row.measured != null && row.measured !== row.kept ? (
                              <span className="tw-calc-sub">
                                {t("wizard.calcEstimateShort", { value: fmt(row.kept) })}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className="tw-col-num"
                            data-state={short ? "short" : "ok"}
                          >
                            {fmt(needed)}
                            <span className="tw-calc-sub">
                              {t("wizard.calcNeededSub", { batches: fmt(current) })}
                            </span>
                          </td>
                          <td className="tw-col-num">{fmt(row.max)}</td>
                          <td className="tw-col-num tw-calc-suggested">
                            {fmt(row.suggested)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {result ? (
            <div className="tw-calc-notes">
              <p>
                {t("wizard.calcRecordings", {
                  used: fmt(result.recordings_used),
                  annotated: fmt(result.recordings_annotated),
                })}
                {result.recordings_too_short > 0
                  ? ` ${t("wizard.calcTooShort", {
                      count: result.recordings_too_short,
                      segment: fmt(draft.spectro.segment_duration),
                    })}`
                  : ""}
                {result.recordings_no_duration > 0
                  ? ` ${t("wizard.calcNoDuration", { count: result.recordings_no_duration })}`
                  : ""}
              </p>
              {result.source === "estimate" ? (
                <p>
                  {t(
                    result.snippet_table.exists && !result.snippet_table.matches_params
                      ? "wizard.calcEstimateStaleTable"
                      : "wizard.calcEstimateNote",
                    { margin: Math.round((1 - result.safety_margin) * 100) },
                  )}
                </p>
              ) : (
                <p>{t("wizard.calcMeasuredNote")}</p>
              )}
              {noBatch.length > 0 ? (
                <p className="tw-calc-warn">
                  {t("wizard.calcNoBatch", {
                    splits: noBatch.map((s) => t(`wizard.calcSplit.${s}`)).join(", "),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="tw-syn-modal-foot">
            <button
              type="button"
              className="tw-reset-btn"
              disabled={loading || !projectId}
              onClick={() => void run()}
            >
              {loading ? t("wizard.calcLoading") : t("wizard.calcRecalculate")}
            </button>
            <div className="tw-syn-modal-actions">
              <button type="button" className="settings-path-btn" onClick={onClose}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                disabled={!canApply}
                onClick={() => {
                  if (!result) return;
                  onApply({
                    train: result.splits.train.suggested,
                    val: result.splits.val.suggested,
                    test: result.splits.test.suggested,
                  });
                  onClose();
                }}
              >
                {t("wizard.calcApply")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}
