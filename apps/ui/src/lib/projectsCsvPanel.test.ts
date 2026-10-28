import { describe, expect, it } from "vitest";
import { nextCsvPanelToggle } from "./projectsCsvPanel";

describe("nextCsvPanelToggle", () => {
  it("closes when already open", () => {
    expect(
      nextCsvPanelToggle({
        isOpen: true,
        hasTablePath: true,
        hasPreview: true,
      }),
    ).toEqual({ action: "close" });
  });

  it("opens without fetch when preview exists", () => {
    expect(
      nextCsvPanelToggle({
        isOpen: false,
        hasTablePath: true,
        hasPreview: true,
      }),
    ).toEqual({ action: "open", needsFetch: false });
  });

  it("opens with fetch when preview missing", () => {
    expect(
      nextCsvPanelToggle({
        isOpen: false,
        hasTablePath: true,
        hasPreview: false,
      }),
    ).toEqual({ action: "open", needsFetch: true });
  });

  it("noops without table path", () => {
    expect(
      nextCsvPanelToggle({
        isOpen: false,
        hasTablePath: false,
        hasPreview: false,
      }),
    ).toEqual({ action: "noop" });
  });
});
