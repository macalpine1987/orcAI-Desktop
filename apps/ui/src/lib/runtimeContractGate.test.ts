import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(...parts: string[]): string {
  return readFileSync(join(repo, ...parts), "utf8");
}

describe("runtime contract gate · docs/RUNTIME_CONTRACT.md", () => {
  it("documents manual start, hide-on-close, and quit stop", () => {
    const doc = read("docs/RUNTIME_CONTRACT.md");
    expect(doc).toContain("startAll");
    expect(doc).toContain("Hide");
    expect(doc).toContain("RunEvent::Exit");
    expect(doc).toContain("runtimeBase");
    expect(doc).toContain("engineReady");
    expect(doc).not.toContain("Full quit on the red traffic-light required");
  });

  it("macOS hide-on-close is fixed in Rust for main only", () => {
    const lib = read("src-tauri/src/lib.rs");
    expect(lib).toContain("hide_on_close_enabled");
    expect(lib).toContain('window.label() == "main"');
    expect(lib).toContain("api.prevent_close()");
    expect(lib).toContain("window.hide()");
    expect(lib).toContain("RunEvent::Exit");
    expect(lib).toContain("stop_sidecar_process");
  });

  it("UI startAll is user-driven; autostart is opt-in and defaults off", () => {
    const ctx = read("apps/ui/src/sidecar/SidecarContext.tsx");
    const life = [
      read("apps/ui/src/sidecar/useRuntimeLifecycle.ts"),
      read("apps/ui/src/sidecar/useMainShellClosePolicy.ts"),
    ].join("\n");
    const health = read("apps/ui/src/sidecar/useSidecarHealthPolling.ts");
    expect(ctx).toContain("useRuntimeLifecycle");
    expect(ctx).toContain("runtimeAutostart");
    expect(life).toContain("const startAll = useCallback");
    expect(life).toContain('closePolicy === "hide"');
    expect(life).toContain("getCurrentWindow().hide()");
    expect(life).toContain("docs/RUNTIME_CONTRACT.md");
    expect(health).toContain("BOOT_POLL_MS = 750");
    expect(ctx).toContain("setInterval(() => setTick((t) => t + 1), 500)");

    const prefs = [
      read("apps/ui/src/preferences/PreferencesContext.tsx"),
      read("apps/ui/src/preferences/preferencesHydration.ts"),
    ].join("\n");
    expect(prefs).toContain("runtimeAutostart: stored.runtimeAutostart ?? false");
  });

  it("engineReady requires sidecarPhase running", () => {
    const ctx = read("apps/ui/src/sidecar/SidecarContext.tsx");
    expect(ctx).toMatch(
      /engineReady\s*=\s*[\s\S]*sidecarPhase === "running"/,
    );
  });

  it("health binding refuses unbound default port in production path", () => {
    const api = read("apps/ui/src/api/sidecar.ts");
    expect(api).toContain("hasRuntimeSidecarBase");
    expect(api).toContain("Sidecar URL is not bound yet");
  });
});
