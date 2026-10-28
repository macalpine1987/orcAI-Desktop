import { describe, expect, it } from "vitest";
import {
  colorForLabel,
  colorWithAlpha,
  createLabelColorMap,
  formatDetectionClassCode,
  formatDetectionTypeLabel,
  formatDetectionTypeLabelWithCode,
  PUBLICATION_LABEL_COLORS,
  PUBLICATION_LABEL_ORDER,
  SIGNAL_TYPE_ALIASES,
  sortLabelsForLegend,
} from "./labelColors";

describe("labelColors", () => {
  it("maps known class names to Paul Tol / orcAI colors (m04)", () => {
    const map = createLabelColorMap(["whistles", "Breathing"]);
    expect(colorForLabel("whistles", map)).toBe("#AA4499");
    expect(colorForLabel("Breathing", map)).toBe("#332288");
  });

  it("applies alpha without CSS opacity", () => {
    expect(colorWithAlpha("#AA4499", 0.5)).toBe("rgba(170, 68, 153, 0.5)");
    expect(colorWithAlpha("#abc", 1)).toBe("rgba(170, 187, 204, 1)");
    expect(colorWithAlpha("rgb(10, 20, 30)", 0.25)).toBe(
      "rgba(10, 20, 30, 0.25)",
    );
    expect(colorWithAlpha("#AA4499", 0)).toBe("rgba(170, 68, 153, 0)");
    expect(colorWithAlpha("hsl(200, 50%, 40%)", 0.4)).toBe(
      "hsla(200, 50%, 40%, 0.4)",
    );
  });

  it("maps orcAI abbreviations (with optional *) to Paul Tol colors", () => {
    const abbreviations = Object.keys(SIGNAL_TYPE_ALIASES) as Array<
      keyof typeof SIGNAL_TYPE_ALIASES
    >;
    for (const abbr of abbreviations) {
      const key = SIGNAL_TYPE_ALIASES[abbr];
      const color = PUBLICATION_LABEL_COLORS[key];
      expect(colorForLabel(abbr.toUpperCase())).toBe(color);
      expect(colorForLabel(`${abbr.toUpperCase()}*`)).toBe(color);
    }
    expect(colorForLabel("BR*")).toBe("#332288");
    expect(colorForLabel("SS*")).toBe("#DDCC77");
    expect(colorForLabel("WH")).toBe("#AA4499");
    expect(colorForLabel("HERDING*")).toBe("#44AA99");
    expect(colorForLabel("WHISTLE*")).toBe("#AA4499");
    expect(colorForLabel("TAILSLAP")).toBe("#CC6677");
  });

  it("formats detection type labels as publication names (ТИП)", () => {
    expect(formatDetectionTypeLabel("BR*")).toBe("breathing");
    expect(formatDetectionTypeLabel("BUZZ")).toBe("buzzing");
    expect(formatDetectionTypeLabel("SS*")).toBe("pulsed calls");
    expect(formatDetectionTypeLabel("HERDING*")).toBe("herding calls");
    expect(formatDetectionTypeLabel("WHISTLE")).toBe("whistles");
    expect(formatDetectionTypeLabel("WHISTLE*")).toBe("whistles");
    expect(formatDetectionTypeLabel("whistles")).toBe("whistles");
    expect(formatDetectionTypeLabel("unknown")).toBe("unknown");
    expect(formatDetectionTypeLabel("KAV*")).toBe("KAV");
    expect(formatDetectionTypeLabel("MEX**")).toBe("MEX");
    expect(formatDetectionTypeLabel("KAV*", { KAV: "kav calls" })).toBe("kav calls");
    expect(formatDetectionTypeLabel("WHISTLE*", { WHISTLE: "other" })).toBe("other");
    expect(formatDetectionTypeLabel("WHISTLE*")).toBe("whistles");
  });

  it("formats orcAI class codes for legend / КЛАСС (m04)", () => {
    expect(formatDetectionClassCode("WHISTLE*")).toBe("WHISTLE");
    expect(formatDetectionClassCode("whistles")).toBe("WHISTLE");
    expect(formatDetectionClassCode("BUZZ")).toBe("BUZZ");
    expect(formatDetectionClassCode("HERDING*")).toBe("HERDING");
    expect(formatDetectionClassCode("TS")).toBe("TAILSLAP");
    expect(formatDetectionClassCode("WH")).toBe("WHISTLE");
  });

  it("keeps code+name helper for tooltips", () => {
    expect(formatDetectionTypeLabelWithCode("WHISTLE")).toBe(
      "WHISTLE (whistles)",
    );
    expect(formatDetectionTypeLabelWithCode("whistles")).toBe(
      "WHISTLE (whistles)",
    );
    expect(formatDetectionTypeLabelWithCode("KAV*")).toBe("KAV");
    expect(formatDetectionTypeLabelWithCode("KAV*", { KAV: "kav calls" })).toBe(
      "KAV (kav calls)",
    );
  });

  it("assigns unique colors for every label in the set", () => {
    const labels = [
      ...PUBLICATION_LABEL_ORDER,
      "unknown A",
      "unknown B",
      "unknown C",
    ];
    const map = createLabelColorMap(labels);
    const colors = labels.map((l) => colorForLabel(l, map));
    expect(new Set(colors).size).toBe(labels.length);
  });

  it("sorts legend in m04 order (WHISTLE before BR)", () => {
    const sorted = sortLabelsForLegend([
      "whistles",
      "breathing",
      "buzzing",
      "unknown class",
    ]);
    expect(sorted.indexOf("whistles")).toBeLessThan(sorted.indexOf("buzzing"));
    expect(sorted.indexOf("buzzing")).toBeLessThan(sorted.indexOf("breathing"));
    expect(sorted.indexOf("unknown class")).toBe(sorted.length - 1);
  });

  it("does not merge trained class codes into builtin abbreviations", () => {
    expect(formatDetectionTypeLabel("SS_A")).toBe("SS_A");
    expect(formatDetectionTypeLabel("WH_2")).toBe("WH_2");
    expect(formatDetectionTypeLabel("BRS")).toBe("BRS");
    expect(formatDetectionClassCode("SS_A")).toBe("SS_A");
  });

  it("keeps full publication order keys", () => {
    expect(PUBLICATION_LABEL_ORDER).toContain("herding calls");
    expect(PUBLICATION_LABEL_ORDER[0]).toBe("whistles");
  });
});
