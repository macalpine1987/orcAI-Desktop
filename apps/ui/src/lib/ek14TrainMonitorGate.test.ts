import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, "src", rel), "utf8");
}

describe("train monitor gate", () => {
  it("PipelinePage opens TrainMonitor as modal over board", () => {
    const page = read("pages/PipelinePage.tsx");
    expect(page).toContain('from "../trainMonitor/TrainMonitor"');
    expect(page).toContain('view === "monitor"');
    expect(page).toContain(
      '<TrainMonitor open={view === "monitor"} onClose={() => setView("board")} />',
    );
    expect(page).not.toContain("pipeline.monitorSoon");
    expect(page).not.toContain('if (view === "monitor")');
  });

  it("TrainMonitor is portaled modal with Close, Stop, Open folder", () => {
    const mon = read("trainMonitor/TrainMonitor.tsx");
    expect(mon).toContain("PredictAppModalPortal");
    expect(mon).toContain("PREDICT_APP_MODAL_OVERLAY_CLASS");
    // QA-H1: overlays must portal into the zoomed shell, not document.body alone.
    const portal = read("lib/predictAppModal.tsx");
    expect(portal).toContain("getAppShellPortalHost");
    expect(portal).not.toMatch(/createPortal\(\s*children,\s*document\.body\s*\)/);
    const host = read("lib/appShellPortal.ts");
    expect(host).toContain(".app-shell-root");
    const fieldHint = read("components/FieldHint.tsx");
    expect(fieldHint).toContain("getAppShellPortalHost");
    expect(fieldHint).not.toMatch(/createPortal\([\s\S]*,\s*document\.body\s*\)/);
    const ctxMenu = read("components/PredictAnalysisPackageContextMenu.tsx");
    expect(ctxMenu).toContain("getAppShellPortalHost");
    expect(mon).toContain("<ModalCloseButton");
    expect(mon).toContain('aria-label={t("common.close")}');
    expect(mon).toContain('t("monitor.done")');
    expect(mon).toContain('snap?.phase === "done"');
    expect(read("components/ModalCloseButton.tsx")).toContain("modal-close");
    expect(mon).not.toContain('className="settings-path-btn"');
    expect(mon).not.toContain('t("monitor.back")');
    expect(mon).toContain("onClose");
    expect(mon).toContain("open: boolean");
    expect(mon).toContain('t("monitor.stop")');
    expect(mon).toContain('t("monitor.openFolder")');
    expect(mon).toContain('topic="train.monitor"');
    expect(mon).toContain("fetchProjectTrainMonitor");
    expect(mon).toContain("cancelJob");
    expect(mon).toContain("PipelineErrorAlert");
    expect(mon).toContain('stepId="train"');
    expect(mon).toContain('from "./MetricChart"');
    expect(mon).toContain("historySeries");
    expect(mon).toContain("trainMetricKey");
    expect(mon).toContain("estimateRemainingSec");
    expect(mon).toContain("fetchJobLogSince");
    expect(mon).toContain("provisionalTrain");
    const chart = read("trainMonitor/MetricChart.tsx");
    expect(chart).toContain("getContext(\"2d\")");
    expect(chart).toContain("tm-chart-canvas");
    expect(chart).toContain("TRAIN_STROKE");
    expect(chart).toContain("VAL_STROKE");
    expect(chart).toContain("LINE_WIDTH");
    // Per-epoch vertex fills caused fat “sausage” strokes on flat val_MBA.
    expect(chart).toContain("no per-epoch vertex fills");
    expect(chart).toContain("completedEpochCount");
    expect(chart).toContain("isValStagnant");
    expect(chart).toContain("chartLiveEpoch");
    expect(chart).toContain("chartValFlat");
    // m14: clean polylines — butt caps, no live marker / best ring on the canvas.
    expect(chart).toContain('lineCap = "butt"');
    expect(chart).not.toContain("Live marker at the last");
    expect(chart).not.toContain("ctx.arc(bx, by");
  });

  it("modal overlay keeps backdrop blur off the dialog subtree (SVG strokes)", () => {
    const css = readFileSync(join(root, "src/styles/analysis-lab.css"), "utf8");
    expect(css).toContain(".predict-app-modal-overlay::before");
    expect(css).toContain("Do NOT put backdrop-filter on this element");
    // Filter must not sit on the overlay itself (breaks WKWebView SVG strokes).
    const overlayBlock = css.slice(
      css.indexOf(".predict-app-modal-overlay {"),
      css.indexOf(".predict-app-modal-overlay::before"),
    );
    expect(overlayBlock).not.toMatch(/^\s*backdrop-filter:/m);
  });

  it("PipelinePage yellow-hints the next manual step instead of reasonHelp banners", () => {
    const page = read("pages/PipelinePage.tsx");
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
    const mon = read("trainMonitor/TrainMonitor.tsx");
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
    const closed = mon.slice(mon.indexOf("if (!open)"), mon.indexOf("void load()"));
    expect(closed.indexOf("stopJobIdRef.current = null")).toBeGreaterThan(-1);
    expect(closed.indexOf("stopJobIdRef.current = null")).toBeLessThan(
      closed.indexOf("setSnap(null)"),
    );
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
    const api = read("api/projects.ts");
    expect(api).toContain("fetchProjectTrainMonitor");
    expect(api).toContain("/train-monitor");
    expect(api).toContain("TrainMonitorSnapshot");
  });

  it("CSS + i18n wired", () => {
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    expect(css).toContain("train-monitor.css");
    const tm = read("styles/train-monitor.css");
    // Content-sized modal: size containment collapses it to zero height.
    expect(tm).not.toMatch(/\.tm-modal \{[^}]*container-type:\s*size/);
    expect(tm).toContain("max-height: min(22rem, 45cqh)");
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
