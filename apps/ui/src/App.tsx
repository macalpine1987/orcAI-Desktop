import { useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useOpenedFiles } from "./hooks/useOpenedFiles";
import { useReconcileWorkspaceOnRuntime } from "./hooks/useReconcileWorkspaceOnRuntime";
import { AppShell } from "./layout/AppShell";
import { HelpPage } from "./pages/HelpPage";
import { HomePage } from "./pages/HomePage";
import { HomePlanRailPreviewPage } from "./pages/home/HomePlanRailPreviewPage";
import { JobsPage } from "./pages/JobsPage";
import { ModelsPage } from "./pages/ModelsPage";
import { PipelinePage } from "./pages/PipelinePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SpectrogramPage } from "./pages/SpectrogramPage";
import { TrainMonitor } from "./trainMonitor/TrainMonitor";
import { PredictSessionProvider } from "./predict/PredictSessionContext";
import { resolveUiScaleFactor } from "./lib/interfaceSettings";
import { applyUiScale } from "./lib/uiScale";
import { usePreferences } from "./preferences/PreferencesContext";

function AppRoutes() {
  useOpenedFiles();
  useReconcileWorkspaceOnRuntime();
  return (
    <Routes>
      <Route path="train-monitor" element={<TrainMonitor />} />
      <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route
            path="__preview/home-plan-rail"
            element={<HomePlanRailPreviewPage />}
          />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="recordings" element={<Navigate to="/projects" replace />} />
          {/* Predict/Results stay mounted in LabKeepAliveHost (Outlet placeholder). */}
          <Route path="predict" element={null} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="spectrogram" element={<SpectrogramPage />} />
          <Route path="results" element={null} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
  );
}

export default function App() {
  const { uiScale } = usePreferences();
  // The preferences shell is a placeholder until storage is ready. Zoom applied
  // there is discarded when this shell mounts, so stamp it again on the real root.
  useLayoutEffect(() => {
    applyUiScale(resolveUiScaleFactor(uiScale));
  }, [uiScale]);

  return (
    <div className="app-shell-root">
      <BrowserRouter>
        <PredictSessionProvider>
          <AppRoutes />
        </PredictSessionProvider>
      </BrowserRouter>
    </div>
  );
}
