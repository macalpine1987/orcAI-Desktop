import type { ButtonHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children">;

/** Red square with a white cross — the same dismiss control as the training monitor. */
export function ModalCloseButton({
  className,
  "aria-label": ariaLabel,
  title,
  ...props
}: Props) {
  const { t } = useTranslation();
  const label = ariaLabel ?? t("common.close");
  return (
    <button
      type="button"
      {...props}
      className={className ? `modal-close ${className}` : "modal-close"}
      aria-label={label}
      title={title ?? label}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
