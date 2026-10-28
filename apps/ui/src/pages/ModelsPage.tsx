import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { pathExists, resolveOrcaiParameterPath } from "../api/fs";
import { createJob } from "../api/jobs";
import {
  checkModelCompatibility,
  exportModelDirectory,
  fetchModelDetail,
  fetchModels,
  importModelDirectory,
  type ModelDetail,
  type OrcaiModel,
} from "../api/models";
import { ModelsStudio } from "../components/ModelsStudio";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useTrackJobInLab } from "../hooks/useTrackJobInLab";
import { useWorkspace } from "../hooks/useWorkspace";
import { isAbortError } from "../lib/fetchErrors";
import { joinFsPath } from "../lib/joinFsPath";
import { pipelineNavInactiveForWorkspace } from "../layout/navigation";
import { modelRowKey } from "../lib/modelsStudio";
import { pickDirectory } from "../platform/dialog";
import { revealInFileManager } from "../platform/shell";
import { isTauri } from "../platform/tauri";
import {
  persistActiveProjectPredictModel,
} from "../workspace/project";
import { savePredictSettings } from "../workspace/predictSettings";

export function ModelsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { online, engineReady } = useSidecarStatus();
  const workspace = useWorkspace();
  const trackJobInLab = useTrackJobInLab();

  const projectDir = workspace.projectDir;
  const sidecarReady = online;

  const [models, setModels] = useState<OrcaiModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModelDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compatBlocked, setCompatBlocked] = useState(false);
  const [compatUnchecked, setCompatUnchecked] = useState(false);

  const activeModelId = workspace.predictSettings?.model ?? null;

  const reload = useCallback(async () => {
    if (!sidecarReady) {
      setModels([]);
      return;
    }
    try {
      const list = await fetchModels(projectDir ?? undefined);
      setModels(list);
      setError(null);
      setSelectedId((cur) => {
        if (cur && list.some((m) => modelRowKey(m) === cur)) return cur;
        const active = list.find(
          (m) =>
            m.id === activeModelId ||
            m.path === activeModelId ||
            m.name === activeModelId,
        );
        return active ? modelRowKey(active) : list[0] ? modelRowKey(list[0]) : null;
      });
    } catch (err) {
      if (isAbortError(err)) return;
      setModels([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sidecarReady, projectDir, activeModelId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => models.find((m) => modelRowKey(m) === selectedId) ?? null,
    [models, selectedId],
  );

  useEffect(() => {
    if (!selected || !sidecarReady) {
      setDetail(null);
      setCompatBlocked(false);
      setCompatUnchecked(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void fetchModelDetail(selected.id, projectDir ?? undefined)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setCompatBlocked(Boolean(d.compatibility?.checked && !d.compatibility.ok));
        setCompatUnchecked(
          Boolean(
            d.compatibility &&
              !d.compatibility.checked &&
              (d.compatibility.reason === "no_project_parameter" ||
                d.compatibility.reason === "no_project"),
          ),
        );
        setError(null);
      })
      .catch((err) => {
        if (cancelled || isAbortError(err)) return;
        setDetail(null);
        setCompatBlocked(false);
        setCompatUnchecked(false);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, sidecarReady, projectDir]);

  const onSelect = (model: OrcaiModel) => {
    setSelectedId(modelRowKey(model));
    setNotice(null);
  };

  const onUse = async () => {
    if (!selected) return;
    if (!projectDir) {
      setError(t("models.needProject"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const compat = await checkModelCompatibility(selected.id, projectDir);
      // Recognition lists every catalog model. Assignment follows that list.
      // Project-parameter mismatches still block Test, which reads that file.
      setCompatBlocked(Boolean(compat.checked && !compat.ok));
      const unchecked =
        !compat.checked &&
        (compat.reason === "no_project_parameter" || compat.reason === "no_project");
      setCompatUnchecked(unchecked);
      const isTrained = selected.kind === "trained";
      savePredictSettings({
        model: selected.id,
        modelDir: isTrained ? selected.path : undefined,
      });
      await persistActiveProjectPredictModel(
        selected.id,
        isTrained ? selected.path : null,
      );
      if (unchecked) {
        setNotice(t("models.compatUncheckedNotice"));
      }
      navigate("/predict", {
        state: {
          model: selected.id,
          ...(isTrained ? { modelDir: selected.path } : {}),
        },
      });
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const onFinetune = () => {
    if (pipelineNavInactiveForWorkspace(workspace)) return;
    if (!selected) {
      setError(t("models.finetuneNeedSelect"));
      return;
    }
    const base = selected.path || selected.id;
    navigate(
      `/pipeline?view=wizard&scenario=finetune&base=${encodeURIComponent(base)}`,
    );
  };

  const onTest = async () => {
    if (!selected || selected.kind !== "trained" || !projectDir) return;
    if (!engineReady) {
      setError(t("models.engineRequired"));
      return;
    }
    if (compatBlocked) {
      setError(t("models.compatBlockedTitle"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const paramPath = await resolveOrcaiParameterPath(projectDir);
      const tvt = joinFsPath(projectDir, "tvt_data");
      const tvtTrain = joinFsPath(tvt, "train_dataset");
      const tvtTest = joinFsPath(tvt, "test_dataset");
      if (!paramPath) {
        setError(t("models.testNeedParameter"));
        return;
      }
      const hasTvt =
        (await pathExists(tvt)) &&
        ((await pathExists(tvtTrain)) || (await pathExists(tvtTest)));
      if (!hasTvt) {
        setError(t("models.testNeedTvt"));
        return;
      }
      const job = await createJob("test", {
        project_dir: projectDir,
        model_dir: selected.path,
        data_dir: tvt,
        orcai_parameter: paramPath,
        test_unfiltered: true,
      });
      trackJobInLab(job);
      setNotice(t("models.testQueued"));
      navigate("/jobs");
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const onOpenFolder = async () => {
    if (!selected || selected.kind === "builtin") return;
    try {
      await revealInFileManager(selected.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onImport = async () => {
    if (!projectDir) {
      setError(t("models.needProject"));
      return;
    }
    if (!isTauri()) {
      setError(t("models.importNeedDesktop"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const dir = await pickDirectory(t("models.importTitle"), projectDir);
      if (!dir) return;
      const { model } = await importModelDirectory({
        sourceDir: dir,
        projectDir,
      });
      await reload();
      setSelectedId(modelRowKey(model));
      setNotice(t("models.importOk", { name: model.name }));
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    if (!selected || selected.kind !== "trained") {
      setError(
        !selected
          ? t("models.exportNeedSelect")
          : t("models.exportBuiltinBlocked"),
      );
      return;
    }
    if (!isTauri()) {
      setError(t("models.exportNeedDesktop"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const destParent = await pickDirectory(
        t("models.exportTitle"),
        projectDir ?? undefined,
      );
      if (!destParent) return;
      const out = await exportModelDirectory({
        modelId: selected.id || selected.path,
        destParent,
        projectDir: projectDir ?? undefined,
      });
      setNotice(t("models.exportOk", { name: out.name }));
      try {
        await revealInFileManager(out.path);
      } catch {
        /* export succeeded even if reveal fails */
      }
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  if (!sidecarReady) {
    return (
      <div className="models-page">
        <div className="models-work-panel studio-panel">
          <p className="models-page-subtitle px-4 py-6">{t("predict.sidecarRequired")}</p>
        </div>
      </div>
    );
  }

  return (
    <ModelsStudio
      models={models}
      selectedId={selectedId}
      detail={detail}
      detailLoading={detailLoading}
      activeModelId={activeModelId}
      busy={busy}
      error={error}
      notice={notice}
      compatBlocked={compatBlocked}
      compatUnchecked={compatUnchecked}
      onSelect={onSelect}
      onUse={() => void onUse()}
      onFinetune={onFinetune}
      finetuneBlocked={pipelineNavInactiveForWorkspace(workspace)}
      onTest={() => void onTest()}
      onOpenFolder={() => void onOpenFolder()}
      onImport={() => void onImport()}
      onExport={() => void onExport()}
    />
  );
}
