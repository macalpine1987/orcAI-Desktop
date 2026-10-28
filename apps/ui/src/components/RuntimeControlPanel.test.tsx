import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderWithProviders } from "../test/render";
import { RuntimeControlPanel } from "./RuntimeControlPanel";

const stoppedLine = {
  label: "Sidecar (FastAPI)",
  status: "stopped",
  ok: false,
  active: false,
};

const runningLine = {
  label: "Sidecar (FastAPI)",
  status: "Running",
  detail: "port 8783",
  ok: true,
  active: false,
};

const engineReady = {
  label: "orcAI engine",
  status: "Loaded",
  detail: "3.0.2 - bundled",
  ok: true,
  active: false,
};

const pythonReady = {
  label: "Python",
  status: "Ready",
  detail: "3.11 · inside .app",
  ok: true,
  active: false,
};

const accelGpu = {
  label: "Accelerator",
  status: "Available",
  detail: "Apple GPU · Metal",
  ok: true,
  available: true,
  active: false,
};

describe("RuntimeControlPanel · A-01…A-04", () => {
  it("A-01/A-02 renders four rows: detail under label, status on right (m01)", () => {
    const { container, unmount } = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="ready"
        sidecarLine={runningLine}
        engineLine={engineReady}
        pythonLine={pythonReady}
        acceleratorLine={accelGpu}
        canStart={false}
        canRestart
        canStop
        busy={false}
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    const rows = container.querySelectorAll(".runtime-component-row");
    expect(rows.length).toBe(4);
    expect(container.querySelectorAll(".runtime-row-lamp").length).toBe(4);
    expect(container.querySelector(".runtime-row-lamp.is-available")).toBeTruthy();
    expect(container.querySelectorAll(".runtime-row-lamp.is-ready").length).toBe(3);
    expect(container.querySelector(".runtime-component-status.is-ready")?.textContent).toMatch(
      /Running|Работает|Loaded|Загружен|Ready|Готов/,
    );
    expect(container.querySelector(".runtime-component-status.is-available")?.textContent).toMatch(
      /Available|Доступен/,
    );
    const sidecarMain = rows[0]?.querySelector(".runtime-component-main");
    expect(sidecarMain?.querySelector(".runtime-component-label")?.textContent).toContain(
      "Sidecar",
    );
    expect(sidecarMain?.querySelector(".runtime-component-detail")?.textContent).toContain(
      "port 8783",
    );
    expect(rows[0]?.querySelector(".runtime-component-status")?.textContent).toMatch(
      /Running|Работает/,
    );
    expect(rows[0]?.querySelector(".runtime-component-right")).toBeNull();
    unmount();
  });

  it("keeps detail slots when stopped so panel is pre-expanded", () => {
    const { container, unmount } = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="idle"
        sidecarLine={stoppedLine}
        engineLine={{ ...engineReady, status: "stopped", ok: false, detail: null }}
        pythonLine={{ ...pythonReady, status: "stopped", ok: false, detail: null }}
        acceleratorLine={{
          ...accelGpu,
          status: "stopped",
          ok: false,
          available: false,
          detail: null,
        }}
        canStart
        canRestart={false}
        canStop={false}
        busy={false}
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    const details = container.querySelectorAll(".runtime-component-detail");
    expect(details.length).toBe(4);
    expect(
      container.querySelectorAll(".runtime-component-detail.is-empty").length,
    ).toBe(4);
    unmount();
  });

  it("A-03 shows Start when stopped and Restart when running", () => {
    const onStart = vi.fn();
    const onRestart = vi.fn();
    const onStop = vi.fn();

    const stopped = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="idle"
        sidecarLine={stoppedLine}
        engineLine={{ ...engineReady, status: "stopped", ok: false, detail: null }}
        canStart
        canRestart={false}
        canStop={false}
        busy={false}
        onStart={onStart}
        onRestart={onRestart}
        onStop={onStop}
      />,
    );
    const startBtn = Array.from(
      stopped.container.querySelectorAll("button"),
    ).find((b) => /Start|Запуск/i.test(b.textContent ?? ""));
    expect(startBtn).toBeTruthy();
    expect(startBtn?.disabled).toBe(false);
    act(() => {
      startBtn?.click();
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    stopped.unmount();

    const running = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="ready"
        sidecarLine={runningLine}
        engineLine={engineReady}
        canStart={false}
        canRestart
        canStop
        busy={false}
        onStart={onStart}
        onRestart={onRestart}
        onStop={onStop}
      />,
    );
    const restartBtn = Array.from(
      running.container.querySelectorAll("button"),
    ).find((b) => /Restart|Перезапустить/i.test(b.textContent ?? ""));
    const stopBtn = Array.from(
      running.container.querySelectorAll("button"),
    ).find((b) => /Stop|Остановить/i.test(b.textContent ?? ""));
    expect(restartBtn).toBeTruthy();
    expect(stopBtn).toBeTruthy();
    expect(stopBtn?.disabled).toBe(false);
    act(() => {
      restartBtn?.click();
      stopBtn?.click();
    });
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    running.unmount();
  });

  it("A-04 shows Autostart is off by default and toggles on click", () => {
    const onAutostart = vi.fn();
    const { container, unmount } = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="idle"
        sidecarLine={stoppedLine}
        engineLine={{ ...engineReady, status: "stopped", ok: false, detail: null }}
        canStart
        canRestart={false}
        canStop={false}
        busy={false}
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onStop={vi.fn()}
        runtimeAutostart={false}
        onRuntimeAutostartChange={onAutostart}
      />,
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[role="switch"]',
    );
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(toggle?.textContent).toMatch(/Autostart is off|Автозапуск выключен/i);
    act(() => {
      toggle?.click();
    });
    expect(onAutostart).toHaveBeenCalledWith(true);
    unmount();
  });

  it("loading rows use is-active yellow pulse lamp", () => {
    const { container, unmount } = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="starting_sidecar"
        sidecarLine={{
          label: "Sidecar (FastAPI)",
          status: "Starting…",
          ok: false,
          active: true,
        }}
        engineLine={{
          label: "orcAI engine",
          status: "Starting…",
          ok: false,
          active: true,
          detail: null,
        }}
        canStart={false}
        canRestart={false}
        canStop
        busy
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".runtime-row-lamp.is-active").length).toBe(2);
    unmount();
  });

  it("accelerator available uses blue is-available lamp", () => {
    const { container, unmount } = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="ready"
        sidecarLine={runningLine}
        engineLine={engineReady}
        acceleratorLine={accelGpu}
        canStart={false}
        canRestart
        canStop
        busy={false}
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(container.querySelector(".runtime-row-lamp.is-available")).toBeTruthy();
    unmount();
  });

  it("CPU accelerator uses ready (green) not available (blue)", () => {
    const { container, unmount } = renderWithProviders(
      <RuntimeControlPanel
        runtimeStep="ready"
        sidecarLine={runningLine}
        engineLine={engineReady}
        acceleratorLine={{
          label: "Accelerator",
          status: "CPU",
          detail: "CPU",
          ok: true,
          available: false,
          active: false,
        }}
        canStart={false}
        canRestart
        canStop
        busy={false}
        onStart={vi.fn()}
        onRestart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(container.querySelector(".runtime-row-lamp.is-available")).toBeNull();
    expect(container.querySelector(".runtime-row-lamp.is-ready")).toBeTruthy();
    expect(container.textContent).toContain("CPU");
    unmount();
  });
});
