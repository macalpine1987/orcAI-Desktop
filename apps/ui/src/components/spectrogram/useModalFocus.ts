import { useEffect, type RefObject } from "react";

export function useModalFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  restoreRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    restoreRef.current = previouslyFocused;
    const root = containerRef.current;
    const focusTarget =
      root?.querySelector<HTMLElement>("[data-modal-initial-focus]") ?? root;
    focusTarget?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !root) return;
      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root?.addEventListener("keydown", onKeyDown);
    return () => {
      root?.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [open, containerRef, restoreRef]);
}
