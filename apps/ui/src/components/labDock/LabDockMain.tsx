import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useJobsListContext } from "../../hooks/useJobsList";
import { useLabJobOptional } from "../../lab/LabJobContext";
import { copyText, jobLogText } from "../../lib/jobLogExport";
import { useSaveNotice } from "../../ui/saveNotice";
import { dockTabSubtitle } from "../../lib/labDockSubtitle";
import {
  clampInspectorWidth,
  LAB_DOCK_INSPECTOR_WIDTH_KEY,
  maxInspectorWidthForContainer,
  LAB_DOCK_PANEL_HEIGHT_CLASS,
  MIN_INSPECTOR_WIDTH,
  RESIZE_HANDLE_WIDTH,
} from "../../lib/labDockLayout";
import type { LabDockProgressModel } from "../../hooks/useLabDockProgress";
import {
  DockToggleChevron,
  DockResizeGripIcon,
  DockTabBar,
  DockStatusDot,
  readInspectorWidth,
} from "./LabDockChrome";
import { LabDockProgressCluster } from "./LabDockProgressCluster";
import { DockPaneContent, JobInspectorParamsBody } from "./LabDockPanes";
import { COPY_FEEDBACK_MS } from "../../lib/timeouts";

export function LabDockMain({
  dockExpanded,
  onCollapse,
  progress,
}: {
  dockExpanded: boolean;
  onCollapse: () => void;
  progress: LabDockProgressModel;
}) {
  const { t } = useTranslation();
  const lab = useLabJobOptional();
  const { notifyHeaderError } = useSaveNotice();
  const { failedJobs } = useJobsListContext();
  const tab = lab?.dockTab ?? "log";
  const splitRef = useRef<HTMLDivElement>(null);
  const [inspectorWidth, setInspectorWidth] = useState(readInspectorWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [logCopied, setLogCopied] = useState(false);
  const logCopiedTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [inspectorMax, setInspectorMax] = useState(720);

  useEffect(() => {
    return () => {
      if (logCopiedTimerRef.current != null) {
        window.clearTimeout(logCopiedTimerRef.current);
      }
    };
  }, []);

  const showSplit = tab === "log";
  const tabSubtitle = dockTabSubtitle(tab, t, lab?.selectedJob ?? null);

  const clampWidth = useCallback((next: number) => {
    return clampInspectorWidth(next, splitRef.current?.clientWidth ?? 0);
  }, []);

  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const syncMax = () => {
      setInspectorMax(maxInspectorWidthForContainer(el.clientWidth));
      setInspectorWidth((w) => clampWidth(w));
    };
    syncMax();
    const ro = new ResizeObserver(syncMax);
    ro.observe(el);
    window.addEventListener("resize", syncMax);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncMax);
    };
  }, [clampWidth]);

  const finishDrag = useCallback(
    (pointerId?: number) => {
      if (!dragRef.current) return;
      if (pointerId != null && dragRef.current.pointerId !== pointerId) return;
      dragRef.current = null;
      setIsDragging(false);
      setInspectorWidth((w) => {
        const clamped = clampWidth(w);
        try {
          localStorage.setItem(
            LAB_DOCK_INSPECTOR_WIDTH_KEY,
            String(Math.round(clamped)),
          );
        } catch {
          /* ignore */
        }
        return clamped;
      });
    },
    [clampWidth],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
      const delta = e.clientX - dragRef.current.startX;
      setInspectorWidth(clampWidth(dragRef.current.startWidth - delta));
    };
    const onPointerUp = (e: PointerEvent) => finishDrag(e.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [clampWidth, finishDrag]);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: inspectorWidth,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      finishDrag(e.pointerId);
    }
  };

  const onCopyLog = () => {
    const job = lab?.selectedJob;
    if (!job) return;
    void copyText(jobLogText(job)).then((ok) => {
      if (ok) {
        setLogCopied(true);
        if (logCopiedTimerRef.current != null) {
          window.clearTimeout(logCopiedTimerRef.current);
        }
        logCopiedTimerRef.current = window.setTimeout(() => setLogCopied(false), COPY_FEEDBACK_MS);
      } else {
        notifyHeaderError(t("common.clipboardFailed"));
      }
    });
  };

  return (
    <div
      ref={splitRef}
      className={clsx("studio-panel lab-dock-frame flex min-h-0 flex-col", LAB_DOCK_PANEL_HEIGHT_CLASS)}
    >
      <div className="lab-dock-header">
        <DockTabBar
          failedCount={failedJobs.length}
          tabSubtitle={tabSubtitle}
        />
        {progress.showProgress || progress.ledStatus ? (
          <div className="lab-dock-header-progress">
            {progress.ledStatus ? (
              <DockStatusDot status={progress.ledStatus} />
            ) : null}
            <LabDockProgressCluster model={progress} showStatusText />
          </div>
        ) : null}
        <div className="lab-dock-toolbar-actions">
          <button
            type="button"
            disabled={!lab?.selectedJob}
            onClick={onCopyLog}
            className="lab-dock-toolbar-btn"
          >
            {logCopied ? t("lab.copiedCommand") : t("lab.copyLog")}
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="lab-dock-toolbar-btn lab-dock-toolbar-btn--collapse"
          >
            {t("lab.collapseShort")}
            <DockToggleChevron expanded />
          </button>
          <span className="lab-dock-grip-icon" aria-hidden>
            <DockResizeGripIcon />
          </span>
        </div>
      </div>
      <div className="lab-dock-body">
        {showSplit ? (
          <>
            <section className="lab-dock-pane lab-dock-pane-log lab-dock-inner-pane">
              <DockPaneContent tab="log" />
            </section>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={inspectorWidth}
              aria-valuemin={MIN_INSPECTOR_WIDTH}
              aria-valuemax={inspectorMax}
              aria-label={t("lab.resizeDockPanels")}
              tabIndex={dockExpanded ? 0 : -1}
              onPointerDown={onResizePointerDown}
              onPointerUp={onResizePointerUp}
              className={clsx(
                "lab-dock-split-handle",
                isDragging && "lab-dock-split-handle-active",
              )}
              style={{ width: RESIZE_HANDLE_WIDTH }}
            />
            <section
              className="lab-dock-pane lab-dock-pane-inspector lab-dock-inner-pane"
              style={{ width: inspectorWidth }}
            >
              <div className="lab-dock-inspector-heading">
                {t("lab.taskParams")}
              </div>
              <div className="lab-dock-pane-scroll">
                <JobInspectorParamsBody />
              </div>
            </section>
          </>
        ) : (
          <section className="lab-dock-pane lab-dock-pane-full">
            <DockPaneContent tab={tab} />
          </section>
        )}
      </div>
    </div>
  );
}

