/** Dev-visible swallow for best-effort paths (Tauri-unavailable, optional files). */
export function silentCatch(tag: string): (err?: unknown) => void {
  return (err?: unknown) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- intentional diagnostic for silent catches
      console.warn(`[silent:${tag}]`, err);
    }
  };
}
