import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderWithProviders } from "../test/render";
import { PredictResultsClassSidebar } from "./PredictResultsClassSidebar";

const noop = () => undefined;

describe("PredictResultsClassSidebar · probability floor C", () => {
  it("shows all at floor 0", () => {
    const { container, unmount } = renderWithProviders(
      <PredictResultsClassSidebar
        entries={[{ label: "whistles", count: 4 }]}
        hidden={new Set()}
        colorMap={new Map()}
        totalCount={4}
        unfilteredCount={4}
        probabilityFloor={0}
        onProbabilityFloorChange={vi.fn()}
        showProbability
        showAnnotations={false}
        annotationsAvailable={false}
        onToggle={noop}
        onShowProbabilityChange={noop}
        onShowAnnotationsChange={noop}
      />,
    );
    expect(container.querySelector(".predict-results-prob-floor-value")?.textContent).toMatch(
      /все|all/,
    );
    const slider = container.querySelector(
      ".predict-results-prob-floor input[type='range']",
    ) as HTMLInputElement;
    expect(slider.value).toBe("0");
    const resetIdle = container.querySelector(
      ".predict-results-prob-floor-reset",
    ) as HTMLButtonElement;
    expect(resetIdle.disabled).toBe(true);
    expect(resetIdle.textContent).toMatch(/Сброс|Reset/);
    unmount();
  });

  it("reset is disabled at 0 and fires 0 when the floor is active", () => {
    const onFloor = vi.fn();
    const { container, unmount } = renderWithProviders(
      <PredictResultsClassSidebar
        entries={[{ label: "whistles", count: 1 }]}
        hidden={new Set()}
        colorMap={new Map()}
        totalCount={1}
        unfilteredCount={4}
        probabilityFloor={90}
        onProbabilityFloorChange={onFloor}
        showProbability
        showAnnotations={false}
        annotationsAvailable={false}
        onToggle={noop}
        onShowProbabilityChange={noop}
        onShowAnnotationsChange={noop}
      />,
    );
    expect(container.querySelector(".predict-results-class-sidebar-count")?.textContent).toBe(
      "1 / 4",
    );
    expect(container.querySelector(".predict-results-prob-floor-value")?.textContent).toContain(
      "90",
    );
    const reset = container.querySelector(
      ".predict-results-prob-floor-reset",
    ) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    expect(reset.textContent).toMatch(/Сброс|Reset/);
    act(() => {
      reset.click();
    });
    expect(onFloor).toHaveBeenCalledWith(0);
    unmount();
  });

  it("hides display block when showDisplayControls is false", () => {
    const { container, unmount } = renderWithProviders(
      <PredictResultsClassSidebar
        entries={[{ label: "whistles", count: 1 }]}
        hidden={new Set()}
        colorMap={new Map()}
        totalCount={1}
        probabilityFloor={0}
        onProbabilityFloorChange={noop}
        showProbability
        showAnnotations={false}
        annotationsAvailable={false}
        onToggle={noop}
        onShowProbabilityChange={noop}
        onShowAnnotationsChange={noop}
        showDisplayControls={false}
      />,
    );
    expect(container.querySelector(".predict-results-display-block")).toBeNull();
    expect(container.querySelector(".predict-results-prob-floor")).toBeTruthy();
    unmount();
  });

  it("lists the selected model's classes and omits builtin extras", () => {
    const { container, unmount } = renderWithProviders(
      <PredictResultsClassSidebar
        entries={[
          { label: "WHISTLE", count: 2 },
          { label: "BR", count: 4 },
        ]}
        modelClasses={["BUZZ", "HERDING", "SS", "TAILSLAP", "WHISTLE"]}
        hidden={new Set()}
        colorMap={new Map()}
        totalCount={2}
        probabilityFloor={0}
        onProbabilityFloorChange={vi.fn()}
        showProbability
        showAnnotations={false}
        annotationsAvailable={false}
        onToggle={noop}
        onShowProbabilityChange={noop}
        onShowAnnotationsChange={noop}
        showDisplayControls={false}
      />,
    );
    const codes = [...container.querySelectorAll(".predict-results-class-code")].map(
      (node) => node.textContent,
    );
    expect(codes).toEqual(["BUZZ", "HERDING", "SS", "TAILSLAP", "WHISTLE"]);
    unmount();
  });

  it("keeps the checkbox for a hidden detected class and disables classes with no hits", () => {
    const { container, unmount } = renderWithProviders(
      <PredictResultsClassSidebar
        entries={[
          { label: "KAV", count: 3 },
          { label: "MEX", count: 0 },
        ]}
        modelClasses={["KAV", "MEX"]}
        hidden={new Set(["KAV"])}
        colorMap={new Map()}
        totalCount={0}
        probabilityFloor={0}
        onProbabilityFloorChange={noop}
        showProbability
        showAnnotations={false}
        annotationsAvailable={false}
        onToggle={noop}
        onShowProbabilityChange={noop}
        onShowAnnotationsChange={noop}
      />,
    );
    const boxes = [
      ...container.querySelectorAll(".predict-results-class-check"),
    ] as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]?.disabled).toBe(false);
    expect(boxes[0]?.checked).toBe(false);
    expect(boxes[1]?.disabled).toBe(true);
    expect(boxes[1]?.checked).toBe(false);
    unmount();
  });
});
