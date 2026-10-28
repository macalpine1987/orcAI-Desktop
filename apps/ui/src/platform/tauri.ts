/** True when the UI runs inside a Tauri webview. */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window ||
      "__TAURI__" in window)
  );
}
