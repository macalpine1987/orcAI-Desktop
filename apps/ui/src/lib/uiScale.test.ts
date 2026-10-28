import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveUiScaleFactor, type UiScalePreset } from "./interfaceSettings";
import { applyUiScale, readAppliedUiScale } from "./uiScale";

describe("uiScale · window presets", () => {
  let dom: Window;

  beforeEach(() => {
    dom = new Window({ url: "http://localhost/" });
    vi.stubGlobal("window", dom);
    vi.stubGlobal("document", dom.document);
  });

  afterEach(() => {
    dom.close();
    vi.unstubAllGlobals();
  });

  function mountShell(): HTMLElement {
    const root = dom.document.createElement("div");
    root.className = "app-shell-root";
    dom.document.body.appendChild(root);
    return root;
  }

  it.each([
    ["100", ""],
    ["125", "1.25"],
  ] as const)("preset %s sets shell zoom to %s", (preset: UiScalePreset, zoom) => {
    const root = mountShell();
    applyUiScale(resolveUiScaleFactor(preset));
    expect(root.style.zoom).toBe(zoom);
    expect(dom.document.documentElement.style.getPropertyValue("--ui-zoom")).toBe(
      String(resolveUiScaleFactor(preset)),
    );
    expect(readAppliedUiScale()).toBe(resolveUiScaleFactor(preset));
  });

  it("clears zoom when returning from 125% to 100%", () => {
    const root = mountShell();
    applyUiScale(resolveUiScaleFactor("125"));
    expect(root.style.zoom).toBe("1.25");
    applyUiScale(resolveUiScaleFactor("100"));
    expect(root.style.zoom).toBe("");
    expect(readAppliedUiScale()).toBe(1);
  });

  it("keeps counter-zoom when the zoomed shell fills the window", () => {
    const root = mountShell();
    Object.defineProperty(dom, "innerWidth", { configurable: true, value: 900 });
    root.getBoundingClientRect = () =>
      ({ width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
    applyUiScale(1.25);
    expect(root.style.zoom).toBe("1.25");
    expect(dom.document.documentElement.style.getPropertyValue("--ui-zoom")).toBe("1.25");
  });

  it("drops counter-zoom when the engine leaves the shell smaller than the window", () => {
    const root = mountShell();
    Object.defineProperty(dom, "innerWidth", { configurable: true, value: 900 });
    root.getBoundingClientRect = () =>
      ({ width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
    applyUiScale(1.25);
    expect(root.style.zoom).toBe("");
    expect(dom.document.documentElement.style.fontSize).toBe("17.5px");
    expect(dom.document.documentElement.style.getPropertyValue("--ui-zoom")).toBe("1");
    expect(readAppliedUiScale()).toBe(1.25);
  });

  it("records the scale even before the shell root is mounted", () => {
    applyUiScale(resolveUiScaleFactor("125"));
    expect(dom.document.querySelector(".app-shell-root")).toBeNull();
    expect(readAppliedUiScale()).toBe(1.25);
  });

  it("treats a missing or unreadable scale as 100%", () => {
    expect(readAppliedUiScale()).toBe(1);
    dom.document.documentElement.dataset.uiScale = "nope";
    expect(readAppliedUiScale()).toBe(1);
    dom.document.documentElement.dataset.uiScale = "0";
    expect(readAppliedUiScale()).toBe(1);
  });
});
