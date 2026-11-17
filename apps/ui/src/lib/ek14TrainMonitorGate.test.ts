import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readAnalysisLabCss } from "./readAnalysisLabCss";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

/** Window page + extracted model hook (string-gate after split). */
function readTrainMonitor(): string {
  return [
    read("trainMonitor/TrainMonitor.tsx"),
    read("trainMonitor/useTrainMonitorModel.ts"),
  ].join("\n");
}

describe("train monitor gate", () => {
  it("PipelinePage opens TrainMonitor as a detached window", () => {
    const page = [read("pages/PipelinePage.tsx"), read("hooks/usePipelineBoard.ts"), read("hooks/usePipelineBoardActions.ts")].join("\n");
    expect(page).toContain('from "../platform/trainMonitorWindow"');
    expect(page).toContain("openOrFocusTrainMonitorWindow");
    expect(page).toContain("openMonitorWindow");
    expect(page).toContain('view !== "monitor"');
    expect(page).toContain('params.get("view") === "monitor"');
    expect(page).toContain("isTrainMonitorEntryEnabled");
    expect(page).toContain("isTrainMonitorLive");
    expect(page).toContain("monitorAvailable");
    expect(page).toContain("monitorLive");
    expect(page).toContain("pipeline.monitorIdleHint");
    expect(page).toContain('state={monitorLive ? "running" : "off"}');
    expect(page).not.toContain('from "../trainMonitor/TrainMonitor"');
    expect(page).not.toContain("open={view === \"monitor\" && monitorAvailable}");
    expect(page).not.toContain("pipeline.monitorSoon");
    const css = read("styles/instrument.css");
    expect(css).toContain(".runtime-ready-lamp.is-running");
    expect(css).toContain("runtime-ready-lamp-running-pulse");
    const app = read("App.tsx");
    expect(app).toContain('path="train-monitor"');
    expect(app).toContain("<TrainMonitor");
  });

  it("TrainMonitor is a window page with Stop, Open folder (OS chrome closes)", () => {
    const mon = readTrainMonitor();
    expect(mon).not.toContain("PredictAppModalPortal");
    expect(mon).not.toContain("PREDICT_APP_MODAL_OVERLAY_CLASS");
    expect(mon).toContain("tm-window");
    expect(mon).toContain("closeTrainMonitorWindow");
    expect(mon).not.toContain("ModalCloseButton");
    expect(mon).toContain('t("monitor.done")');
    expect(mon).toContain('snap?.phase === "done"');
    expect(mon).not.toContain('className="settings-path-btn"');
    expect(mon).not.toContain('t("monitor.back")');
    expect(mon).toContain("onClose");
    expect(mon).toContain('t("monitor.stop")');
    expect(mon).toContain('t("monitor.openFolder")');
    expect(mon).toContain('topic="train.monitor"');
    expect(mon).toContain("openHelpInMainShell");
    expect(mon).toContain('from "../platform/shellNavigate"');
    expect(read("platform/shellNavigate.ts")).toContain("emitTo");
    expect(read("platform/shellNavigate.ts")).toContain(
      "SHELL_NAVIGATE_EVENT",
    );
    expect(read("hooks/useShellNavigateListener.ts")).toContain(
      "SHELL_NAVIGATE_EVENT",
    );
    expect(read("layout/AppShell.tsx")).toContain("useShellNavigateListener");
    expect(read("platform/localeSync.ts")).toContain("LOCALE_CHANGED_EVENT");
    expect(read("platform/localeSync.ts")).toContain(
      "broadcastLocaleToTrainMonitor",
    );
    expect(read("hooks/useTrainMonitorLocaleListener.ts")).toContain(
      "LOCALE_CHANGED_EVENT",
    );
    expect(read("preferences/PreferencesContext.tsx")).toContain(
      "useTrainMonitorLocaleListener",
    );
    expect(read("i18n.ts")).toContain("broadcastLocaleToTrainMonitor");
    expect(mon).toContain("fetchProjectTrainMonitor");
    expect(mon).toContain("hasRuntimeSidecarBase");
    expect(mon).toContain("useSidecarStatus");
    expect(mon).toContain("isTransientRuntimeBindError");
    expect(mon).toContain("runtimeReady");
    expect(mon).toContain("cancelJob");
    expect(mon).toContain("PipelineErrorAlert");
    expect(mon).toContain('stepId="train"');
    expect(mon).toContain('from "./MetricChart"');
    expect(mon).toContain("historySeries");
    expect(mon).toContain("trainMetricKey");
    expect(mon).toContain("estimateRemainingSec");
    expect(mon).toContain("fetchJobLogSince");
    expect(mon).toContain("provisionalTrain");
    const win = read("platform/trainMonitorWindow.ts");
    expect(win).toContain("WebviewWindow");
    expect(win).toContain("train-monitor");
    expect(win).toContain("openOrFocusTrainMonitorWindow");
    expect(win).toContain('TRAIN_MONITOR_WINDOW_TITLE = "orcAI - train"');
    expect(win).not.toContain("title?: string");
    expect(win).toContain("applyTrainMonitorIcon");
    expect(win).toContain("train-monitor-icon.png");
    expect(mon).not.toContain("setTitle");
    expect(mon).not.toContain("phaseRunning");
    expect(mon).not.toContain("windowTitle");
    expect(win).toContain("setIcon");
    /* Floor above CSS stack breakpoint (1100) so open size needs no window scroll. */
    expect(win).toContain("TRAIN_MONITOR_MIN_WIDTH = 1120");
    expect(win).toContain("TRAIN_MONITOR_MIN_HEIGHT = 720");
    expect(win).toContain("ensureTrainMonitorFloor");
    expect(win).toContain("setMinSize");
    expect(read("styles/train-monitor.css")).toContain("max-width: 1100px");
    const chart = read("trainMonitor/MetricChart.tsx");
    expect(chart).toContain("getContext(\"2d\")");
    expect(chart).toContain("tm-chart-canvas");
    expect(chart).toContain("TRAIN_STROKE");
    expect(chart).toContain("VAL_STROKE");
    expect(chart).toContain("LINE_WIDTH");
    expect(chart).toContain("no per-epoch vertex fills");
    expect(chart).toContain("completedEpochCount");
    expect(chart).toContain("isValStagnant");
    expect(chart).toContain("chartLiveEpoch");
    expect(chart).toContain("chartValFlat");
    expect(chart).toContain('lineCap = "butt"');
    expect(chart).not.toContain("Live marker at the last");
    expect(chart).not.toContain("ctx.arc(bx, by");
  });

  it("main hide-on-close does not apply to child windows", () => {
    const rust = readFileSync(
      join(root, "../../src-tauri/src/lib.rs"),
      "utf8",
    );
    expect(rust).toContain('window.label() == "main"');
    expect(rust).toContain("hide_on_close_enabled");
    const healthPoll = read("sidecar/useSidecarHealthPolling.ts");
    expect(healthPoll).toContain("isMainShellWindow");
    expect(healthPoll).toContain("Child windows (train-monitor)");
  });

  it("modal overlay keeps backdrop blur off the dialog subtree (SVG strokes)", () => {
    const css = readAnalysisLabCss();
    expect(css).toContain(".predict-app-modal-overlay::before");
    expect(css).toContain("Do NOT put backdrop-filter on this element");
    const overlayBlock = css.slice(
      css.indexOf(".predict-app-modal-overlay {"),
      css.indexOf(".predict-app-modal-overlay::before"),
    );
    expect(overlayBlock).not.toMatch(/^\s*backdrop-filter:/m);
  });

  it("PipelinePage yellow-hints the next manual step instead of reasonHelp banners", () => {
    const page = [
      read("pages/PipelinePage.tsx"),
      read("hooks/usePipelineBoard.ts"),
      read("hooks/usePipelineBoardActions.ts"),
      read("components/pipeline/PipelineBoardSteps.tsx"),
    ].join("\n");
    expect(page).toContain("PipelineErrorAlert");
    expect(page).not.toContain("PipelineReasonAlert");
    expect(page).toContain("hintStepForPipelineReason");
    expect(page).toContain("pp-btn--hint");
    expect(page).toContain("manualHintStepId");
  });

  it("pipeline error taxonomy covers TVT GZIP and common failures", () => {
    const explain = read("lib/pipelineErrorExplain.ts");
    expect(explain).toContain('"tvt_gzip_corrupt"');
    expect(explain).toContain('"oom"');
    expect(explain).toContain('"snippets_shortage"');
    expect(explain).toContain('"cannot_mask_na"');
    expect(explain).toContain("pipelineErrorCopy");
  });

  it("stop paints Остановлено before the cancel request returns", () => {
    const mon = readTrainMonitor();
    const stop = mon.slice(mon.indexOf("const stopTrain"), mon.indexOf("const openFolder"));
    expect(stop.indexOf('phase: "cancelled"')).toBeGreaterThan(-1);
    expect(stop.indexOf('phase: "cancelled"')).toBeLessThan(stop.indexOf("await cancelJob"));
    expect(stop).toContain('job_status: "cancelled"');
    expect(stop).toContain("remaining_sec: null");
    expect(stop).toContain("await load(true)");
    expect(stop.startsWith("const stopTrain = () =>")).toBe(true);
    expect(stop).toContain("void (async () =>");
    expect(stop).toContain("stopJobIdRef.current = jobId");
    expect(stop).toContain("await cancelJob");
    expect(stop).toContain("await refreshJobs()");
    expect(mon).not.toContain("setStopping");
    expect(mon).not.toContain("disabled={stopping}");
    expect(mon).not.toContain("if (!stopping)");
    const load = mon.slice(
      mon.indexOf("const load = useCallback"),
      mon.indexOf("const busy"),
    );
    expect(load).toContain("stopJobIdRef.current === data.job_id");
    expect(load).toContain('data.phase === "running" || data.phase === "queued"');
    expect(load).toContain("epoch: prev.epoch");
    expect(load).toContain("elapsed_sec: prev.elapsed_sec");
    expect(load).toContain("remaining_sec: null");
    const projectReset = mon.slice(
      mon.indexOf("}, [projectId]);"),
      mon.indexOf("void load();"),
    );
    // stop latch clears when the project changes, before the next load cycle.
    expect(mon).toContain("stopJobIdRef.current = null");
    expect(mon).toContain("}, [projectId]);");
    expect(projectReset.length).toBeGreaterThanOrEqual(0);
    expect(mon).toContain('t("monitor.stopped")');
    expect(mon).toContain("tm-batch-stopped");
    expect(mon).toContain('snap?.phase === "done"');
    const css = read("styles/train-monitor.css");
    expect(css).toContain(".tm-batch-stopped");
    expect(css).toContain("#c5c8cc");
    expect(css).toContain("#9aa0a6");
    expect(css).not.toMatch(/\.tm-batch-stopped::before\s*\{[^}]*box-shadow/);
    const ru = JSON.parse(
      readFileSync(join(root, "public/locales/ru/ru.json"), "utf8"),
    ) as { monitor: { stopped: string; done: string } };
    const en = JSON.parse(
      readFileSync(join(root, "public/locales/en/en.json"), "utf8"),
    ) as { monitor: { stopped: string; done: string } };
    expect(ru.monitor.stopped).toBe("Остановлено");
    expect(en.monitor.stopped).toBe("Stopped");
    expect(ru.monitor.done).toBe("Готово");
  });

  it("API client exposes train-monitor", () => {
    const api = [
      read("api/projects/index.ts"),
      read("api/projects/trainMonitor.ts"),
      read("api/projects/types.ts"),
    ].join("\n");
    expect(api).toContain("fetchProjectTrainMonitor");
    expect(api).toContain("/train-monitor");
    expect(api).toContain("TrainMonitorSnapshot");
  });

  it("CSS + i18n wired", () => {
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    expect(css).toContain("train-monitor.css");
    const tm = read("styles/train-monitor.css");
    expect(tm).not.toMatch(/\.tm-window-frame \{[^}]*container-type:\s*size/);
    expect(tm).toContain("max-height: min(22rem, 45cqh)");
    expect(tm).toContain(".tm-window");
    const ru = JSON.parse(
      readFileSync(join(root, "public/locales/ru/ru.json"), "utf8"),
    ) as { monitor: { title: string; stop: string } };
    const en = JSON.parse(
      readFileSync(join(root, "public/locales/en/en.json"), "utf8"),
    ) as { monitor: { title: string; stop: string } };
    expect(ru.monitor.title).toContain("монитор");
    expect(en.monitor.title.toLowerCase()).toContain("monitor");
    expect(ru.monitor.stop).toBeTruthy();
    expect(en.monitor.stop).toBeTruthy();
  });
});
