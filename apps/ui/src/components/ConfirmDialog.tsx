import { useEffect, type ReactNode } from "react";
import { ModalCloseButton } from "./ModalCloseButton";

export function ConfirmDialog({
  open,
  title,
  children,
  onClose,
  busy = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** When true, Escape / overlay click do not dismiss the dialog. */
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (!busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="predict-app-modal-overlay"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-[var(--radius)] border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-dialog-head mb-3">
          <h2
            id="confirm-dialog-title"
            className="text-base font-semibold text-foreground"
          >
            {title}
          </h2>
          <ModalCloseButton disabled={busy} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
