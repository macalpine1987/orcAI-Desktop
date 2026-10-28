import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { helpHref, topicForPath } from "../lib/helpManifest";

/** Compact circle-? mark for page-header Help (m01 screenshot). */
function HelpMarkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      aria-hidden
      className="page-help-btn-icon"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9.5 9.5a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.5-1.7 2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17.5" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

type PageHelpButtonProps = {
  /** Opens `/help?topic=` for this help_topics id when omitted, derived from the route. */
  topic?: string;
  /** Tooltip only (FR-11.13). Not painted next to the button. */
  hint?: string;
  /** Opens `/help` when omitted. */
  onClick?: () => void;
  label?: string;
  title?: string;
  className?: string;
};

/**
 * Outlined page-header Help control (screenshot: circle-? + «Справка»).
 * Link to `/help` by default; pass `onClick` for in-page help dialogs.
 */
export function PageHelpButton({
  topic,
  hint,
  onClick,
  label,
  title,
  className,
}: PageHelpButtonProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const text = label ?? t("nav.help");
  const classes = ["page-help-btn", className].filter(Boolean).join(" ");
  const resolvedTopic = topic ?? topicForPath(location.pathname);
  const to = helpHref({ topic: resolvedTopic });

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        title={title ?? hint ?? text}
      >
        <HelpMarkIcon />
        <span>{text}</span>
      </button>
    );
  }

  return (
    <Link to={to} className={classes} title={title ?? hint ?? text}>
      <HelpMarkIcon />
      <span>{text}</span>
    </Link>
  );
}
