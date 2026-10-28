/** Host for overlays that must follow UI Scale (`zoom` on `.app-shell-root`). */

export function getAppShellPortalHost(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("getAppShellPortalHost requires document");
  }
  return (
    (document.querySelector(".app-shell-root") as HTMLElement | null) ??
    document.body
  );
}
