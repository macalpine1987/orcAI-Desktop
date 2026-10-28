import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchProjectParameters,
  saveProjectParameters,
  validateProjectParameters,
  type ProjectParameters,
} from "../api/projects";
import { ProjectParametersTab } from "./projects/ProjectParametersTab";
import {
  PREDICT_APP_MODAL_OVERLAY_CLASS,
  PredictAppModalPortal,
} from "../lib/predictAppModal";
import { pickJsonOutputFile } from "../platform/dialog";
import { writeTextFileAbsolute } from "../platform/shell";
import { isTauri } from "../platform/tauri";
import { ModalCloseButton } from "./ModalCloseButton";

type Props = {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function PipelineParamsModal({ open, projectId, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [data, setData] = useState<ProjectParameters | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setBusy(false);
      return;
    }
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchProjectParameters(projectId)
      .then((doc) => {
        if (!cancelled) setData(doc);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

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

  const onValidate = useCallback(
    (text: string) => {
      if (!projectId) return Promise.reject(new Error("no project"));
      return validateProjectParameters(projectId, text);
    },
    [projectId],
  );

  const onSave = async (text: string) => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveProjectParameters(projectId, text);
      setData(saved);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onExport = async (text: string) => {
    if (!data) return;
    if (!isTauri()) {
      setError(t("projects.desktopRequired"));
      return;
    }
    const target = await pickJsonOutputFile(t("pipeline.exportTitle"), data.filename);
    if (!target) return;
    try {
      await writeTextFileAbsolute(target, text.endsWith("\n") ? text : `${text}\n`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!open) return null;

  return (
    <PredictAppModalPortal>
      <div
        className={PREDICT_APP_MODAL_OVERLAY_CLASS}
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="pp-params-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pp-params-modal-head">
            <h2 id={titleId}>{t("pipeline.editParamsTitle")}</h2>
            <ModalCloseButton disabled={busy} onClick={onClose} />
          </div>
          {error ? <p className="pp-params-modal-error">{error}</p> : null}
          <div className="pp-params-modal-body">
            <ProjectParametersTab
              data={data}
              loading={loading}
              busy={busy}
              onValidate={onValidate}
              onSave={onSave}
              onExport={onExport}
            />
          </div>
        </div>
      </div>
    </PredictAppModalPortal>
  );
}
