import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "../components/ModalCloseButton";

type ConflictPrompt = {
  kind: "file";
  fileName: string;
  labelPath: string;
};

type BatchPrompt = {
  kind: "batch";
  count: number;
  total: number;
};

type Prompt = ConflictPrompt | BatchPrompt;

export function usePredictOverwriteDialog() {
  const { t } = useTranslation();
  const titleId = useId();
  const resolverRef = useRef<((overwrite: boolean) => void) | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const close = useCallback((overwrite: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPrompt(null);
    resolve?.(overwrite);
  }, []);

  const askFileOverwrite = useCallback(
    (fileName: string, labelPath: string): Promise<boolean> =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setPrompt({ kind: "file", fileName, labelPath });
      }),
    [],
  );

  const askBatchOverwrite = useCallback(
    (count: number, total: number): Promise<boolean> =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setPrompt({ kind: "batch", count, total });
      }),
    [],
  );

  useEffect(() => {
    if (!prompt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, prompt]);

  const dialog =
    prompt == null ? null : (
      <PredictAppModalPortal>
        <div
          className={PREDICT_APP_MODAL_OVERLAY_CLASS}
          role="presentation"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-lg mat-panel p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-dialog-head">
              <h2 id={titleId} className="text-sm font-semibold text-foreground">
                {prompt.kind === "file"
                  ? t("predict.overwriteConflict.title")
                  : t("predict.overwriteConflict.batchTitle")}
              </h2>
              <ModalCloseButton onClick={() => close(false)} />
            </div>
            <p className="mt-3 text-sm text-foreground-muted">
              {prompt.kind === "file"
                ? t("predict.overwriteConflict.intro", {
                    fileName: prompt.fileName,
                  })
                : t("predict.run.confirmOverwrite", {
                    count: prompt.count,
                    total: prompt.total,
                  })}
            </p>
            {prompt.kind === "file" ? (
              <p className="mt-3 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                {prompt.labelPath}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                {prompt.kind === "file"
                  ? t("predict.overwriteConflict.skip")
                  : t("common.cancel")}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                {t("predict.overwriteConflict.overwrite")}
              </button>
            </div>
          </div>
        </div>
      </PredictAppModalPortal>
    );

  return { dialog, askFileOverwrite, askBatchOverwrite };
}
