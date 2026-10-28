import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useClearedActiveProjectNotice } from "../hooks/useClearedActiveProjectNotice";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { ModalCloseButton } from "./ModalCloseButton";

function IconExclamationMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={40}
      height={40}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <circle
        cx="20"
        cy="20"
        r="17"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 11v12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="20" cy="29" r="1.8" fill="currentColor" />
    </svg>
  );
}

/**
 * Notice after hard-prune of the active project folder.
 * Modal (all pages) until the user dismisses with OK.
 */
export function ClearedActiveProjectBanner() {
  const { t } = useTranslation();
  const { notice, dismiss } = useClearedActiveProjectNotice();
  const titleId = useId();
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!notice) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notice, dismiss]);

  if (!notice) return null;

  const message = notice.path
    ? t("home.clearedActiveProjectWithPath", { path: notice.path })
    : t("home.clearedActiveProject");

  return (
    <PredictAppModalPortal>
      <div
        className={`${PREDICT_APP_MODAL_OVERLAY_CLASS} cleared-active-project-overlay`}
        role="presentation"
        onClick={dismiss}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="cleared-active-project-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <ModalCloseButton onClick={dismiss} />
          <div className="cleared-active-project-modal-icon" aria-hidden>
            <IconExclamationMark />
          </div>
          <p id={titleId} className="cleared-active-project-modal-text">
            {message}
          </p>
          <button
            ref={okRef}
            type="button"
            className="cleared-active-project-modal-ok"
            onClick={dismiss}
          >
            {t("home.clearedActiveProjectDismiss")}
          </button>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}
