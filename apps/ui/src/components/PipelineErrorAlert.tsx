import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  classifyPipelineError,
  pipelineErrorCopy,
  resolveErrorLang,
  type PipelineErrorKind,
} from "../lib/pipelineErrorExplain";

type Props = {
  raw: string;
  /** Optional step id for the title prefix (e.g. create-tvt-data). */
  stepId?: string | null;
  className?: string;
  /** When true, always show the technical dump in a <details>. */
  showRawDetails?: boolean;
};

/**
 * Friendly pipeline/job error banner with remediation steps.
 * Copy lives in pipelineErrorExplain (RU/EN); i18n keys override when present.
 */
export function PipelineErrorAlert({
  raw,
  stepId,
  className,
  showRawDetails = true,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = resolveErrorLang(i18n.language);
  const kind = classifyPipelineError(raw);
  const copy = pipelineErrorCopy(kind, lang);
  const i18nBase = `pipeline.errors.${kind}`;

  const title = t(`${i18nBase}.title`, { defaultValue: copy.title });
  const body = t(`${i18nBase}.body`, { defaultValue: copy.body });
  const stepsLabel = t(`${i18nBase}.stepsLabel`, { defaultValue: copy.stepsLabel });
  const steps = copy.steps.map((fallback, i) =>
    t(`${i18nBase}.step${i + 1}`, { defaultValue: fallback }),
  );

  const stepLabel = stepId
    ? t(`pipeline.steps.${stepId}`, { defaultValue: stepId })
    : null;

  return (
    <div
      className={clsx(
        "tm-alert",
        copy.tone === "warn" && "tm-alert--tvt",
        className,
      )}
      role="alert"
      data-error-kind={kind as PipelineErrorKind}
    >
      <p className="tm-alert-title">
        {stepLabel ? `${stepLabel}: ${title}` : title}
      </p>
      <p className="tm-alert-body">{body}</p>
      <p className="tm-alert-steps-label">{stepsLabel}</p>
      <ol className="tm-alert-steps">
        {steps.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ol>
      {showRawDetails ? (
        <details className="tm-alert-details">
          <summary>
            {t("pipeline.errors.showRaw", {
              defaultValue:
                lang === "ru" ? "Технический текст ошибки" : "Technical error text",
            })}
          </summary>
          <pre className="tm-alert-raw">{raw}</pre>
        </details>
      ) : (
        kind === "generic" ? (
          <p className="tm-alert-body tm-alert-body--mono">{raw}</p>
        ) : null
      )}
    </div>
  );
}
