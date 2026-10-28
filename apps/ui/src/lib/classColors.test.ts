import { describe, expect, it } from "vitest";
import {
  CLASS_COLOR_PRESETS,
  classColorsEditable,
  mergeLabelColorOverrides,
  normalizeClassColor,
  parseClassColorsJson,
  serializeClassColors,
} from "./classColors";
import { colorForLabel, createLabelColorMap } from "./labelColors";

describe("classColors", () => {
  it("parses and serializes only valid hex overrides", () => {
    const parsed = parseClassColorsJson(
      JSON.stringify({
        version: 1,
        colors: { WHISTLE: "#aa4499", BAD: "red", OK: "#123" },
      }),
    );
    expect(parsed.WHISTLE).toBe("#AA4499");
    expect(parsed.OK).toBe("#112233");
    expect(parsed.BAD).toBeUndefined();
    const text = serializeClassColors(parsed);
    expect(JSON.parse(text).version).toBe(1);
    expect(JSON.parse(text).colors.WHISTLE).toBe("#AA4499");
  });

  it("editable only for from_scratch and finetune", () => {
    expect(classColorsEditable("from_scratch")).toBe(true);
    expect(classColorsEditable("finetune")).toBe(true);
    expect(classColorsEditable("hpsearch")).toBe(false);
  });

  it("presets include Paul Tol publication colors", () => {
    expect(CLASS_COLOR_PRESETS).toContain("#AA4499");
    expect(normalizeClassColor("red")).toBeNull();
    expect(normalizeClassColor("#aa4499")).toBe("#AA4499");
    expect(normalizeClassColor("#aA4")).toBe("#AAAA44");
  });

  it("colorForLabel prefers project overrides", () => {
    expect(colorForLabel("WHISTLE")).toBe("#AA4499");
    expect(colorForLabel("WHISTLE", undefined, { WHISTLE: "#d55e00" })).toBe(
      "#D55E00",
    );
    const map = mergeLabelColorOverrides(createLabelColorMap(["WHISTLE", "BUZZ"]), {
      BUZZ: "#0072B2",
    });
    expect(colorForLabel("BUZZ", map)).toBe("#0072B2");
  });
});
