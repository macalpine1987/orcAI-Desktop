import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParameterValidation, ProjectParameters } from "../../api/projects";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { IconWarning } from "./ProjectsIcons";

type Props = {
  data: ProjectParameters | null;
  loading: boolean;
  busy: boolean;
  onValidate: (text: string) => Promise<ParameterValidation>;
  onSave: (text: string) => Promise<void>;
  onExport: (text: string) => Promise<void>;
};

/** m25 «Параметры»: <name>_orcai_parameter.json editor with live validation. */
export function ProjectParametersTab({ data, loading, busy, onValidate, onSave, onExport }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(data?.text ?? "");
  const [validation, setValidation] = useState<ParameterValidation | null>(
    data?.validation ?? null,
  );
  const loadedFor = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const debounced = useDebouncedValue(text, 450);
  const dirty = data != null && text !== data.text;
  dirtyRef.current = dirty;

  // Re-seed the editor when a different file (or a fresh read) arrives.
  useEffect(() => {
    if (!data) return;
    const stamp = `${data.path}:${data.updated_at ?? 0}`;
    if (loadedFor.current === stamp) return;
    const sameFile = loadedFor.current?.startsWith(`${data.path}:`);
    if (sameFile && dirtyRef.current) return;
    loadedFor.current = stamp;
    setText(data.text);
    setValidation(data.validation);
  }, [data]);

  useEffect(() => {
    if (!data || !dirty) return;
    let cancelled = false;
    void onValidate(debounced)
      .then((v) => {
        if (!cancelled) setValidation(v);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `text` changes are folded into `debounced`; `dirty` is derived from `text`.
  }, [debounced, data, dirty, onValidate]);

  if (loading && !data) {
    return <p className="text-xs text-foreground-muted">{t("projects.studio.params.loading")}</p>;
  }
  if (!data) return null;

  if (!data.exists) {
    return <p className="ps-hint-bar is-warn">{t("projects.studio.params.missing")}</p>;
  }

  const valid = validation?.valid ?? true;
  const pill = !valid ? "is-invalid" : dirty ? "is-dirty" : "is-valid";
  const pillLabel = !valid
    ? t("projects.studio.params.invalid")
    : dirty
      ? t("projects.studio.params.dirty")
      : t("projects.studio.params.valid");

  return (
    <div className="space-y-3">
      <div className="ps-params-head">
        <span className="ps-params-file" title={data.path}>
          {data.filename}
        </span>
        <span className={clsx("ps-pill", pill)}>{pillLabel}</span>
        <div className="ps-params-actions">
          <button
            type="button"
            className="ps-btn ps-btn-primary ps-btn-sm"
            disabled={busy || !dirty || !valid}
            onClick={() => void onSave(text)}
          >
            {t("projects.studio.params.save")}
          </button>
          <button
            type="button"
            className="ps-btn ps-btn-sm"
            disabled={busy || !dirty}
            onClick={() => {
              setText(data.text);
              setValidation(data.validation);
            }}
          >
            {t("projects.studio.params.cancel")}
          </button>
          <button
            type="button"
            className="ps-btn ps-btn-sm"
            disabled={busy}
            title={t("projects.studio.params.exportTitle")}
            onClick={() => void onExport(text)}
          >
            {t("projects.studio.params.export")}
          </button>
        </div>
      </div>

      <textarea
        className="ps-params-editor"
        value={text}
        spellCheck={false}
        aria-label={t("projects.studio.params.aria")}
        onChange={(e) => setText(e.target.value)}
      />

      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) ? (
        <ul className="ps-params-issues">
          {validation.errors.map((msg) => (
            <li key={`e:${msg}`} className="ps-params-issue ps-text-err">
              <IconWarning />
              <span>{msg}</span>
            </li>
          ))}
          {validation.warnings.map((msg) => (
            <li key={`w:${msg}`} className="ps-params-issue ps-text-warn">
              <IconWarning />
              <span>{msg}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
