import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { PredictResultsClassesFilterModal } from "./PredictResultsClassesFilterModal";

describe("PredictResultsClassesFilterModal", () => {
  it("renders class + probability controls without display toggles", () => {
    const { unmount } = renderWithProviders(
      <PredictResultsClassesFilterModal
        open
        onClose={vi.fn()}
        entries={[{ label: "whistles", count: 3 }]}
        hidden={new Set()}
        colorMap={new Map()}
        totalCount={3}
        probabilityFloor={0}
        onProbabilityFloorChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(
      document.querySelector(".predict-results-classes-filter-modal"),
    ).toBeTruthy();
    expect(
      document.querySelector(".predict-results-class-sidebar"),
    ).toBeTruthy();
    expect(document.querySelector(".predict-results-class-list")).toBeTruthy();
    expect(
      document.querySelector(".predict-results-prob-floor"),
    ).toBeTruthy();
    expect(
      document.querySelector(".predict-results-display-block"),
    ).toBeNull();
    unmount();
  });

  it("renders nothing when closed", () => {
    const { unmount } = renderWithProviders(
      <PredictResultsClassesFilterModal
        open={false}
        onClose={vi.fn()}
        entries={[]}
        hidden={new Set()}
        colorMap={new Map()}
        totalCount={0}
        probabilityFloor={0}
        onProbabilityFloorChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(
      document.querySelector(".predict-results-classes-filter-modal"),
    ).toBeNull();
    unmount();
  });
});
