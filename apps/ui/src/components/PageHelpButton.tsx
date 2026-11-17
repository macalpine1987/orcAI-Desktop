import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { helpHref, topicForPath } from "../lib/helpManifest";

/** Bare circle-? mark for page-header Help (icon-only, no chrome). */
function HelpMarkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
      className="page-help-btn-icon"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
      />
      <path
        d="M9.5 9.5a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.5-1.7 2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17.5" r="1.15" fill="currentColor" stroke="none" />
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
  /** Accessible name / tooltip; defaults to nav.help («Справка»). Not shown on face. */
  label?: string;
  title?: string;
  className?: string;
};

/**
 * Icon-only page-header Help control: bare ? (~22px), no rim/fill/label.
 * Tooltip + aria-label keep «Справка». Link to `/help` by default;
 * pass `onClick` for in-page help dialogs.
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
  const tip = title ?? hint ?? text;
  const classes = ["page-help-btn", className].filter(Boolean).join(" ");
  const resolvedTopic = topic ?? topicForPath(location.pathname);
  const to = helpHref({ topic: resolvedTopic });

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        title={tip}
        aria-label={text}
      >
        <HelpMarkIcon />
      </button>
    );
  }

  return (
    <Link to={to} className={classes} title={tip} aria-label={text}>
      <HelpMarkIcon />
    </Link>
  );
}
