import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "../components/ModalCloseButton";
import { highlightJsonLine } from "../lib/labDockHighlight";
import { copyText } from "../lib/jobLogExport";
import { useSaveNotice } from "../ui/saveNotice";
import { draftToParameterJson } from "./defaults";
import type { TrainWizardDraft } from "./types";
import { COPY_FEEDBACK_MS } from "../lib/timeouts";

type Props = {
  open: boolean;
  draft: TrainWizardDraft;
  fileRel: string;
  busy?: boolean;
  onClose: () => void;
  /** Save current draft JSON to disk (no Finder). */
  onSave: () => Promise<void>;
  /** Save then reveal in file manager. */
  onReveal: () => Promise<void>;
};

export function TrainWizardParamsJsonModal({
  open,
  draft,
  fileRel,
  busy = false,
  onClose,
  onSave,
  onReveal,
}: Props) {
  const { t } = useTranslation();
  const { notifyHeaderError } = useSaveNotice();
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const text = useMemo(() => {
    const jsonObj = draftToParameterJson(draft);
    return `${JSON.stringify(jsonObj, null, 4)}\n`;
  }, [draft]);
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);

  useEffect(() => {
    if (!open) {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopied(false);
      setActionBusy(false);
    }
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

  const disabled = busy || actionBusy;

  const onCopy = async () => {
    const ok = await copyText(text);
    if (!ok) {
      notifyHeaderError(t("common.clipboardFailed"));
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  const run = async (fn: () => Promise<void>) => {
    setActionBusy(true);
    try {
      await fn();
    } finally {
      setActionBusy(false);
    }
  };

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
          className="tw-syn-modal tw-params-json-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tw-syn-modal-head">
            <div className="tw-syn-modal-titles">
              <h2 id={titleId}>{t("wizard.paramsJsonTitle")}</h2>
              <p className="tw-syn-modal-file font-mono">{fileRel}</p>
            </div>
            <ModalCloseButton disabled={disabled} onClick={onClose} />
          </div>
          <p className="tw-syn-modal-hint">{t("wizard.paramsJsonHint")}</p>
          <div className="tw-syn-modal-body tw-params-json-body">
            <pre className="tw-params-json-pre" tabIndex={0}>
              {lines.map((line, index) => (
                <Fragment key={index}>
                  {highlightJsonLine(line)}
                  {index < lines.length - 1 ? "\n" : null}
                </Fragment>
              ))}
            </pre>
          </div>
          <div className="tw-syn-modal-foot tw-params-json-foot">
            <button
              type="button"
              className="pp-btn pp-btn-preset"
              disabled={disabled}
              onClick={() => void onCopy()}
            >
              {copied ? t("wizard.paramsJsonCopied") : t("wizard.paramsJsonCopy")}
            </button>
            <button
              type="button"
              className="pp-btn pp-btn-preset"
              disabled={disabled}
              onClick={() => void run(onSave)}
            >
              {t("wizard.paramsJsonSave")}
            </button>
            <button
              type="button"
              className="pp-btn pp-btn-preset"
              disabled={disabled}
              onClick={() => void run(onReveal)}
            >
              {t("wizard.paramsJsonReveal")}
            </button>
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}
