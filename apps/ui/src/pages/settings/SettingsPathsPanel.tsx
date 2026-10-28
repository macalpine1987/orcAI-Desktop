import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { clearSpectrogramCache, factoryResetDesktop } from "../../api/maintenance";
import { useJobsListOptional } from "../../jobs/JobsListContext";
import { pickDirectory } from "../../platform/dialog";
import {
  clearSpecCacheOnDisk,
  clearDesktopWebStorage,
  resetDesktopDbOnDisk,
  truncateSidecarLog,
  wipeOrcaiDesktopDir,
} from "../../platform/desktopReset";
import {
  defaultProjectsRoot,
  desktopDataDir,
  formatUserPath,
  openAppFile,
  openAppFolder,
  sidecarLogPath,
} from "../../platform/fsPaths";
import { isTauri } from "../../platform/tauri";
import { usePreferences } from "../../preferences/PreferencesContext";
import { useSidecarStatus } from "../../hooks/useSidecarStatus";
import { invalidateSpectrogramTileCache } from "../../lib/spectrogramTileCache";
import { useSaveNotice } from "../../ui/saveNotice";
import { resetWorkspace } from "../../workspace/storage";

function PathField({
  label,
  value,
  onBrowse,
  onOpen,
  browseLabel,
  openLabel,
}: {
  label: string;
  value: string;
  onBrowse?: () => void;
  onOpen: () => void;
  browseLabel: string;
  openLabel: string;
}) {
  return (
    <div className="settings-path-row">
      <div className="settings-path-label">{label}</div>
      <div className="settings-path-value" title={value}>
        {value}
      </div>
      {onBrowse ? (
        <button type="button" className="settings-path-btn" onClick={onBrowse}>
          {browseLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="settings-path-btn"
        disabled={!value}
        onClick={onOpen}
      >
        {openLabel}
      </button>
    </div>
  );
}

export function SettingsPathsPanel() {
  const { t } = useTranslation();
  const { notifySaved } = useSaveNotice();
  const { projectsRoot, setProjectsRoot, resetToFactoryDefaults } =
    usePreferences();
  const { online, sidecarPhase, stopAll } = useSidecarStatus();
  const jobsList = useJobsListOptional();

  const [projectsDisplay, setProjectsDisplay] = useState(projectsRoot);
  const [projectsAbs, setProjectsAbs] = useState(projectsRoot);
  const [dataDisplay, setDataDisplay] = useState("");
  const [dataAbs, setDataAbs] = useState("");
  const [logDisplay, setLogDisplay] = useState("");
  const [logAbs, setLogAbs] = useState("");
  const [busy, setBusy] = useState<"cache" | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const sidecarRunning = online && sidecarPhase === "running";
  const sidecarBusy =
    sidecarPhase === "starting" || sidecarPhase === "stopping";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const projects = projectsRoot.trim() || (await defaultProjectsRoot());
      const data = await desktopDataDir();
      const log = await sidecarLogPath();
      const [projectsFmt, dataFmt, logFmt] = await Promise.all([
        formatUserPath(projects),
        formatUserPath(data),
        formatUserPath(log),
      ]);
      if (cancelled) return;
      setProjectsAbs(projects);
      setProjectsDisplay(projectsFmt);
      setDataAbs(data);
      setDataDisplay(dataFmt);
      setLogAbs(log);
      setLogDisplay(logFmt);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectsRoot]);

  const browseProjects = useCallback(async () => {
    if (!isTauri()) return;
    const dir = await pickDirectory(t("settings.pathBrowseTitle"));
    if (!dir) return;
    setProjectsRoot(dir);
  }, [setProjectsRoot, t]);

  const onClearCache = useCallback(async () => {
    setBusy("cache");
    setActionError(null);
    try {
      if (sidecarRunning) {
        await clearSpectrogramCache();
      } else {
        await clearSpecCacheOnDisk();
      }
      invalidateSpectrogramTileCache();
      notifySaved(t("settings.pathClearCacheDone"));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [notifySaved, sidecarRunning, t]);

  const onConfirmReset = useCallback(async () => {
    setBusy("reset");
    setActionError(null);
    try {
      if (sidecarRunning) {
        await factoryResetDesktop();
        await stopAll();
      } else if (sidecarBusy) {
        await stopAll();
      }
      await resetDesktopDbOnDisk();
      await clearSpecCacheOnDisk();
      await wipeOrcaiDesktopDir();
      await truncateSidecarLog();
      clearDesktopWebStorage();
      resetWorkspace();
      jobsList?.clearLocalJobs();
      await resetToFactoryDefaults();
      setConfirmReset(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [jobsList, resetToFactoryDefaults, sidecarBusy, sidecarRunning, stopAll]);

  return (
    <section
      className="settings-studio-card settings-paths-card"
      aria-labelledby="settings-paths"
    >
      <h2 id="settings-paths" className="settings-studio-card-title">
        {t("settings.pathsTitle")}
      </h2>
      <div className="settings-studio-card-body settings-paths-body">
        <PathField
          label={t("settings.pathProjects")}
          value={projectsDisplay}
          browseLabel={t("settings.pathBrowse")}
          openLabel={t("settings.pathOpen")}
          onBrowse={() => void browseProjects()}
          onOpen={() => void openAppFolder(projectsAbs)}
        />
        <PathField
          label={t("settings.pathData")}
          value={dataDisplay}
          browseLabel={t("settings.pathBrowse")}
          openLabel={t("settings.pathOpen")}
          onOpen={() => void openAppFolder(dataAbs)}
        />
        <PathField
          label={t("settings.pathSidecarLog")}
          value={logDisplay}
          browseLabel={t("settings.pathBrowse")}
          openLabel={t("settings.pathOpen")}
          onOpen={() => void openAppFile(logAbs)}
        />

        <div className="settings-path-actions">
          <div className="settings-path-action-row">
            <div>
              <div className="settings-path-label">{t("settings.pathClearCache")}</div>
              <p className="settings-path-action-hint">
                {t("settings.pathClearCacheHint")}
              </p>
            </div>
            <button
              type="button"
              className="settings-path-btn"
              disabled={busy !== null || (!isTauri() && !sidecarRunning)}
              onClick={() => void onClearCache()}
            >
              {t("settings.pathClearCacheAction")}
            </button>
          </div>
          <div className="settings-path-action-row">
            <div>
              <div className="settings-path-label">
                {t("settings.pathFactoryReset")}
              </div>
              <p className="settings-path-action-hint">
                {t("settings.pathFactoryResetHint")}
              </p>
            </div>
            <button
              type="button"
              className="settings-path-btn settings-path-btn-danger"
              disabled={busy !== null}
              onClick={() => setConfirmReset(true)}
            >
              {t("settings.pathFactoryResetAction")}
            </button>
          </div>
        </div>
        {actionError ? (
          <p className="settings-path-action-error">{actionError}</p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t("settings.pathFactoryResetTitle")}
        busy={busy === "reset"}
        onClose={() => {
          if (busy !== "reset") setConfirmReset(false);
        }}
      >
        <p className="mb-4 text-sm text-foreground-muted">
          {t("settings.pathFactoryResetBody")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onConfirmReset()}
            disabled={busy === "reset"}
            className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            {t("settings.pathFactoryResetConfirm")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset(false)}
            disabled={busy === "reset"}
            className="mat-btn px-3 py-2 text-sm underline disabled:opacity-40"
          >
            {t("settings.pathFactoryResetCancel")}
          </button>
        </div>
      </ConfirmDialog>
    </section>
  );
}
