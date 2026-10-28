import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getAppShellPortalHost } from "../lib/appShellPortal";

const VIEWPORT_MARGIN = 12;
const GAP = 8;
const MAX_WIDTH = 320;

/** Compact (?) hint; help panel opens on click and renders in a portal (not clipped). */
export function FieldHint({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const updatePosition = () => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelW = panelRect.width || Math.min(MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const panelH = panelRect.height || 120;

    let top = triggerRect.bottom + GAP;
    const spaceBelow = window.innerHeight - VIEWPORT_MARGIN - top;
    const spaceAbove = triggerRect.top - GAP - VIEWPORT_MARGIN;
    if (spaceBelow < panelH && spaceAbove > spaceBelow) {
      top = triggerRect.top - GAP - panelH;
    }

    let left = triggerRect.left + triggerRect.width / 2 - panelW / 2;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - panelW;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, maxLeft));

    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    updatePosition();
    setVisible(true);
  }, [open, children]);

  useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const panel =
    open &&
    createPortal(
      <div
        ref={panelRef}
        id={tooltipId}
        role="tooltip"
        className="fixed z-[250] mat-raised px-3 py-2.5 text-left text-xs leading-relaxed text-foreground-muted shadow-xl"
        style={{
          top: coords.top,
          left: coords.left,
          width: `min(${MAX_WIDTH}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
          visibility: visible ? "visible" : "hidden",
        }}
      >
        {title && (
          <span className="mb-1 block font-medium text-foreground">{title}</span>
        )}
        {children}
      </div>,
      getAppShellPortalHost(),
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-semibold leading-none text-foreground-muted transition-colors hover:border-foreground-muted/50 hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {panel}
    </>
  );
}
