import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { isTauri } from "../../platform/tauri";
import {
  annotationPathsFromFileList,
  filterAnnotationPaths,
} from "../../lib/annotationDrop";
import { pointInClientRect } from "../../lib/wavDrop";

type Options = {
  enabled: boolean;
  onDropPaths: (paths: string[]) => void;
};

function physicalToClient(position: { x: number; y: number }): { x: number; y: number } {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return { x: position.x / dpr, y: position.y / dpr };
}

/** Drop zone for Audacity label ``.txt`` paths (mirrors WAV drop). */
export function useAnnotationDropZone({ enabled, onDropPaths }: Options) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const htmlDepthRef = useRef(0);
  const onDropRef = useRef(onDropPaths);
  onDropRef.current = onDropPaths;

  useEffect(() => {
    if (!enabled || !isTauri()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
      if (cancelled) return;
      void getCurrentWebview()
        .onDragDropEvent((event) => {
          const zone = zoneRef.current;
          const payload = event.payload;

          if (payload.type === "leave") {
            setActive(false);
            return;
          }

          if (payload.type === "enter" || payload.type === "over" || payload.type === "drop") {
            const { x, y } = physicalToClient(payload.position);
            const inside = pointInClientRect(x, y, zone?.getBoundingClientRect());
            if (payload.type === "drop") {
              setActive(false);
              if (!inside) return;
              const txts = filterAnnotationPaths(payload.paths);
              if (txts.length) onDropRef.current(txts);
              return;
            }
            setActive(inside);
          }
        })
        .then((fn) => {
          if (cancelled) {
            fn();
            return;
          }
          unlisten = fn;
        });
    });

    return () => {
      cancelled = true;
      unlisten?.();
      setActive(false);
    };
  }, [enabled]);

  const onDragEnter = (e: ReactDragEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    htmlDepthRef.current += 1;
    setActive(true);
  };

  const onDragOver = (e: ReactDragEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e: ReactDragEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    htmlDepthRef.current = Math.max(0, htmlDepthRef.current - 1);
    if (htmlDepthRef.current === 0) setActive(false);
  };

  const onDrop = (e: ReactDragEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    htmlDepthRef.current = 0;
    setActive(false);
    const txts = annotationPathsFromFileList(e.dataTransfer.files);
    if (txts.length) onDropRef.current(txts);
  };

  return {
    zoneRef,
    active,
    dropProps: enabled
      ? { onDragEnter, onDragOver, onDragLeave, onDrop }
      : {},
  };
}
