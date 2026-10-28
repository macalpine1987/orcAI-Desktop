import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchModels } from "../api/models";
import {
  RuntimeControlPanel,
  type RuntimePanelModel,
} from "../components/RuntimeControlPanel";
import { PageHelpButton } from "../components/PageHelpButton";
import { isRuntimeFreePath } from "../lib/appAccess";
import { useSectionsAccessible } from "../hooks/useAppAccess";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useSidecarStatus } from "../hooks/useSidecarStatus";
import { useWorkspace } from "../hooks/useWorkspace";
import {
  formatRuntimeAcceleratorLabel,
  isActiveCpu,
  isStaleSidecarCapabilities,
} from "../lib/sidecarCapabilities";
import { usePreferences } from "../preferences/PreferencesContext";
import { isRecordingTableBlockingPredict } from "../lib/recordingTableGate";
import { HomeProjectCard, shortHomeModelLabel } from "./home/HomeProjectCard";
import { HomeQuickActions } from "./home/HomeQuickActions";
import { HomeRecentJobs } from "./home/HomeRecentJobs";

type HomeLocationState = { returnTo?: string };

export function HomePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const {
    runtimeAutostart,
    setRuntimeAutostart,
  } = usePreferences();
  const {
    engineReady,
    online,
    capabilities,
    sidecarPhase,
    enginePhase,
    sidecarPort,
    runtimeStep,
    lastError,
    startAll,
    stopAll,
  } = useSidecarStatus();
  const sectionsAccessible = useSectionsAccessible();
  const [busy, setBusy] = useState(false);
  const [panelModels, setPanelModels] = useState<RuntimePanelModel[]>([]);
  const { summary, loading: summaryLoading, error: summaryError } =
    useProjectSummary(workspace.activeProjectId);

  const predictBlocked = isRecordingTableBlockingPredict({
    syncStatus: summary?.recording_table.sync_status,
    wavCount: summary?.readiness_lines.recordings.wav_count ?? 0,
    autoSync: summary?.auto_sync_recording_table ?? true,
  });

  const returnTo = (location.state as HomeLocationState | null)?.returnTo;

  useEffect(() => {
    if (!engineReady) {
      setPanelModels([]);
      return;
    }
    let cancelled = false;
    void fetchModels(workspace.projectDir ?? undefined)
      .then((models) => {
        if (cancelled) return;
        const mapped: RuntimePanelModel[] = models.map((m) => ({
          id: m.id,
          name: m.name,
          kind: m.kind === "trained" ? "trained" : "builtin",
        }));
        if (mapped.length > 0) {
          setPanelModels(mapped);
          return;
        }
        const fallback = (capabilities?.builtin_models ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          kind: "builtin" as const,
        }));
        setPanelModels(fallback);
      })
      .catch(() => {
        if (cancelled) return;
        setPanelModels(
          (capabilities?.builtin_models ?? []).map((m) => ({
            id: m.id,
            name: m.name,
            kind: "builtin" as const,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [engineReady, workspace.projectDir, capabilities?.builtin_models]);

  const modelsForPanel = useMemo(() => {
    if (panelModels.length > 0) return panelModels;
    return (capabilities?.builtin_models ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      kind: "builtin" as const,
    }));
  }, [panelModels, capabilities?.builtin_models]);

  const activeModelLabel = useMemo(() => {
    const modelId = workspace.predictSettings?.model;
    const modelDir = workspace.predictSettings?.modelDir;
    if (modelId) {
      const fromPanel = modelsForPanel.find((m) => m.id === modelId);
      // Prefer human name; fall back to modelDir / id (paths shortened in LCD helper).
      return shortHomeModelLabel(fromPanel?.name ?? modelDir ?? modelId);
    }
    return shortHomeModelLabel(summary?.primary_model_name);
  }, [
    modelsForPanel,
    workspace.predictSettings?.model,
    workspace.predictSettings?.modelDir,
    summary?.primary_model_name,
  ]);

  const wrap = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const restartAll = useCallback(async () => {
    await stopAll();
    await startAll();
  }, [startAll, stopAll]);

  const runtimeRunning =
    sidecarPhase === "running" ||
    sidecarPhase === "starting" ||
    enginePhase === "running" ||
    enginePhase === "starting" ||
    runtimeStep === "ready" ||
    runtimeStep === "starting_sidecar" ||
    runtimeStep === "starting_engine";

  const showReturnBanner =
    sectionsAccessible &&
    returnTo &&
    !isRuntimeFreePath(returnTo);

  const summaryBusy =
    summaryLoading && Boolean(workspace.activeProjectId) && online;

  const acceleratorCapsReady =
    engineReady &&
    Boolean(capabilities) &&
    !isStaleSidecarCapabilities(capabilities);
  const acceleratorCpuOnly =
    acceleratorCapsReady &&
    capabilities != null &&
    isActiveCpu(capabilities);
  const acceleratorGpuReady = acceleratorCapsReady && !acceleratorCpuOnly;
  /** Boot in progress — unfinished rows pulse yellow until each becomes ready. */
  const runtimeBooting =
    runtimeStep === "starting_sidecar" ||
    runtimeStep === "starting_engine";

  return (
    <div className="home-page home-studio">
      <div className="studio-panel home-work-panel">
        <div className="home-page-header">
          <div className="home-page-header-copy">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("home.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              {t("home.subtitle")}
            </p>
          </div>
          <PageHelpButton />
        </div>

        <div className="home-panel-body">
          {showReturnBanner ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/35 bg-accent/10 px-4 py-3">
              <p className="text-sm text-foreground">{t("home.returnToHint")}</p>
              <button
                type="button"
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
                onClick={() => navigate(returnTo!, { replace: true, state: null })}
              >
                {t("home.returnToContinue")}
              </button>
            </div>
          ) : null}

          <div className="home-grid-top">
            <RuntimeControlPanel
              runtimeStep={runtimeStep}
              sidecarLine={{
                label: t("home.runtimeSidecar"),
                status:
                  sidecarPhase === "error"
                    ? t("home.runtimeComponentError")
                    : sidecarPhase === "running"
                      ? t("home.runtimeSidecarRunning")
                      : sidecarPhase === "starting" ||
                          runtimeStep === "starting_sidecar"
                        ? t("home.runtimeComponentActive")
                        : t("home.runtimeComponentStopped"),
                detail:
                  sidecarPhase === "running" && sidecarPort != null
                    ? t("home.runtimeSidecarPort", { port: sidecarPort })
                    : null,
                ok: sidecarPhase === "running",
                active:
                  sidecarPhase !== "running" &&
                  sidecarPhase !== "error" &&
                  (runtimeBooting || sidecarPhase === "starting"),
                error: sidecarPhase === "error",
              }}
              engineLine={{
                label: t("home.runtimeEngine"),
                status:
                  enginePhase === "error"
                    ? t("home.runtimeComponentError")
                    : engineReady
                      ? t("home.runtimeEngineLoaded")
                      : enginePhase === "starting" ||
                          runtimeStep === "starting_engine" ||
                          runtimeBooting
                        ? t("home.runtimeComponentActive")
                        : t("home.runtimeComponentStopped"),
                detail:
                  engineReady && capabilities?.orcai_version
                    ? t("home.runtimeEngineBundled", {
                        version: capabilities.orcai_version,
                      })
                    : null,
                ok: engineReady,
                active:
                  !engineReady &&
                  enginePhase !== "error" &&
                  (runtimeBooting || enginePhase === "starting"),
                error: enginePhase === "error",
              }}
              pythonLine={{
                label: t("home.runtimePython"),
                status:
                  sidecarPhase === "running"
                    ? t("home.runtimePythonReady")
                    : sidecarPhase === "starting" || runtimeBooting
                      ? t("home.runtimeComponentActive")
                      : t("home.runtimeComponentStopped"),
                detail:
                  sidecarPhase === "running" && capabilities?.python
                    ? t("home.runtimePythonBundled", {
                        python: capabilities.python,
                      })
                    : null,
                ok: sidecarPhase === "running",
                active:
                  sidecarPhase !== "running" &&
                  sidecarPhase !== "error" &&
                  (runtimeBooting || sidecarPhase === "starting"),
              }}
              acceleratorLine={{
                label: t("home.runtimeAccelerator"),
                status: acceleratorCpuOnly
                  ? t("home.runtimeAcceleratorCpu")
                  : acceleratorGpuReady
                    ? t("home.runtimeAcceleratorAvailable")
                    : runtimeBooting
                      ? t("home.runtimeComponentActive")
                      : t("home.runtimeComponentStopped"),
                detail: acceleratorCapsReady
                  ? formatRuntimeAcceleratorLabel(capabilities!, t)
                  : null,
                ok: acceleratorCapsReady,
                available: acceleratorGpuReady,
                active: !acceleratorCapsReady && runtimeBooting,
              }}
              canStart={
                !engineReady &&
                runtimeStep !== "starting_sidecar" &&
                runtimeStep !== "starting_engine" &&
                runtimeStep !== "stopping"
              }
              canRestart={engineReady && runtimeStep !== "stopping"}
              canStop={
                runtimeRunning ||
                runtimeStep === "stopping" ||
                runtimeStep === "error"
              }
              busy={busy}
              onStart={() => wrap(startAll)}
              onRestart={() => wrap(restartAll)}
              onStop={() => wrap(stopAll)}
              runtimeAutostart={runtimeAutostart}
              onRuntimeAutostartChange={setRuntimeAutostart}
            />

            <HomeProjectCard
              projectName={workspace.projectName}
              projectPath={workspace.projectDir}
              recordings={summary?.metrics.recordings ?? null}
              annotations={summary?.metrics.annotations ?? null}
              predicted={summary?.metrics.predicted ?? null}
              activeModelLabel={activeModelLabel}
              tableSyncStatus={summary?.recording_table.sync_status ?? null}
              loading={summaryBusy}
              engineReady={engineReady}
              onChangeProject={() => navigate("/projects")}
            />
          </div>

          {summaryError ? (
            <p className="mat-inset px-3 py-2 font-mono text-xs text-foreground">
              {summaryError}
            </p>
          ) : null}

          <HomeQuickActions predictBlocked={predictBlocked} />
          <HomeRecentJobs />

          {lastError ? (
            <p className="mat-inset px-3 py-2 font-mono text-xs text-foreground">
              {lastError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
