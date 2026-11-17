import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { HeaderNoticeKind } from "../ui/saveNotice";

type Props = {
  kind: HeaderNoticeKind;
  message: string;
  dismissible?: boolean;
  actionLabel?: string;
  actionTo?: string;
  onDismiss?: () => void;
};

function NoticeIcon({ kind }: { kind: HeaderNoticeKind }) {
  if (kind === "tip") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="mat-header-notice-icon-svg">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.5 18h5M10 21h4M8.2 14.2a5.5 5.5 0 1 1 7.6 0c-.7.7-1.3 1.5-1.5 2.5H9.7c-.2-1-.8-1.8-1.5-2.5Z"
        />
      </svg>
    );
  }
  if (kind === "error") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="mat-header-notice-icon-svg">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          d="M12 4.2 20.2 19H3.8L12 4.2Z"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          d="M12 10v4.2M12 16.8v.2"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mat-header-notice-icon-svg">
      <circle
        cx="12"
        cy="12"
        r="8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M12 11.2V16M12 8.2v.2"
      />
    </svg>
  );
}

/** Header toast chip: grows horizontally for long text, single-line height. */
export function HeaderNoticeChip({
  kind,
  message,
  dismissible,
  actionLabel,
  actionTo,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const labelKey =
    kind === "tip"
      ? "headerNotice.tip"
      : kind === "error"
        ? "headerNotice.error"
        : "headerNotice.info";

  return (
    <div
      className={`mat-header-notice-chip mat-header-notice-chip--${kind}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <span className="mat-header-notice-icon" aria-hidden>
        <NoticeIcon kind={kind} />
      </span>
      <span className="mat-header-notice-copy">
        <span className="mat-header-notice-kind">{t(labelKey)}</span>
        <span className="mat-header-notice-text" title={message}>
          {message}
        </span>
      </span>
      {actionLabel && actionTo ? (
        <Link to={actionTo} className="mat-header-notice-action">
          {actionLabel}
        </Link>
      ) : null}
      {dismissible ? (
        <button
          type="button"
          className="mat-header-notice-dismiss"
          onClick={onDismiss}
          aria-label={t("shellHealth.dismiss")}
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
    </div>
  );
}
