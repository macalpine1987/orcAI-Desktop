import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParameterValidation, ProjectParameters } from "../../api/projects";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { splitParameterExcludedCalls } from "../../lib/parameterExcludedCalls";
import { useSaveNotice } from "../../ui/saveNotice";
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
  const { notifyHeaderError } = useSaveNotice();
  const [text, setText] = useState(data?.text ?? "");
  const [validation, setValidation] = useState<ParameterValidation | null>(
    data?.validation ?? null,
  );
  const [excludedOpen, setExcludedOpen] = useState(false);
  const excludedWrapRef = useRef<HTMLDivElement>(null);
  const loadedFor = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const debounced = useDebouncedValue(text, 450);
  const dirty = data != null && text !== data.text;
  dirtyRef.current = dirty;

  const { excluded, otherWarnings } = useMemo(
    () => splitParameterExcludedCalls(validation),
    [validation],
  );

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
    setExcludedOpen(false);
  }, [data]);

  useEffect(() => {
    if (!data || !dirty) return;
    let cancelled = false;
    void onValidate(debounced)
      .then((v) => {
        if (!cancelled) setValidation(v);
      })
      .catch(() => {
        if (!cancelled) {
          notifyHeaderError(t("projects.studio.params.validateFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
    // `text` changes are folded into `debounced`; `dirty` is derived from `text`.
  }, [debounced, data, dirty, onValidate, notifyHeaderError, t]);

  useEffect(() => {
    if (!excludedOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!excludedWrapRef.current?.contains(e.target as Node)) {
        setExcludedOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExcludedOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [excludedOpen]);

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
  const showExcludedHint = valid && excluded.length > 0;

  return (
    <div className="space-y-3">
      <div className="ps-params-head">
        <span className="ps-params-file" title={data.path}>
          {data.filename}
        </span>
        <span className="ps-params-status">
          <span className={clsx("ps-pill", pill)}>{pillLabel}</span>
          {showExcludedHint ? (
            <div className="ps-params-excluded" ref={excludedWrapRef}>
              <button
                type="button"
                className={clsx(
                  "ps-params-excluded-btn",
                  excludedOpen && "is-open",
                )}
                aria-expanded={excludedOpen}
                aria-controls="ps-params-excluded-list"
                title={t("projects.studio.params.excludedCallsHint")}
                onClick={() => setExcludedOpen((v) => !v)}
              >
                <IconWarning size={13} />
                <span className="sr-only">
                  {t("projects.studio.params.excludedCallsHint")}
                </span>
              </button>
              {excludedOpen ? (
                <div
                  id="ps-params-excluded-list"
                  className="ps-params-excluded-pop"
                  role="status"
                >
                  <p className="ps-params-excluded-title">
                    {t("projects.studio.params.excludedCallsTitle")}
                  </p>
                  <ul className="ps-params-excluded-list">
                    {excluded.map((name) => (
                      <li key={name}>
                        <code>{name}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </span>
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
              setExcludedOpen(false);
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

      {validation &&
      (validation.errors.length > 0 || otherWarnings.length > 0) ? (
        <ul className="ps-params-issues">
          {validation.errors.map((msg) => (
            <li key={`e:${msg}`} className="ps-params-issue ps-text-err">
              <IconWarning />
              <span>{msg}</span>
            </li>
          ))}
          {otherWarnings.map((msg) => (
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
