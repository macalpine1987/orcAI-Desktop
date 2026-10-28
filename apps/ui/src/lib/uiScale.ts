const ROOT_SELECTOR = ".app-shell-root";
const ROOT_FONT_PX = 14;

/**
 * Apply UI zoom on the app shell (WebKit/Tauri).
 * The shell lays out at 100%/zoom. WebKit expands that box back to the window.
 * Blink keeps the pre-zoom border box, which would leave a corner island and
 * clip the magnified page with no scroll. There the zoom is cleared and the
 * root font size carries the same factor, so rem layout grows and scrolls.
 */
export function applyUiScale(factor: number): void {
  const safe = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const root = document.documentElement;
  root.style.fontSize = "";
  root.style.setProperty("--ui-zoom", String(safe));
  root.dataset.uiScale = String(safe);
  const shells = document.querySelectorAll(ROOT_SELECTOR);
  shells.forEach((node) => {
    (node as HTMLElement).style.zoom = safe === 1 ? "" : String(safe);
  });
  const shell = shells[shells.length - 1] as HTMLElement | undefined;
  if (!shell || safe === 1) return;
  const width = shell.getBoundingClientRect().width;
  if (width > 0 && width < window.innerWidth * 0.92) {
    root.style.setProperty("--ui-zoom", "1");
    shells.forEach((node) => {
      (node as HTMLElement).style.zoom = "";
    });
    root.style.fontSize = `${ROOT_FONT_PX * safe}px`;
  }
}

export function readAppliedUiScale(): number {
  const raw = document.documentElement.dataset.uiScale;
  if (!raw) return 1;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
