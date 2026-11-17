import { describe, expect, it } from "vitest";
import { splitParameterExcludedCalls } from "./parameterExcludedCalls";

describe("splitParameterExcludedCalls", () => {
  it("prefers excluded_calls and strips legacy warning lines", () => {
    const { excluded, otherWarnings } = splitParameterExcludedCalls({
      valid: true,
      errors: [],
      warnings: [
        "BR excluded from calls",
        "Something else",
        "WHISTLE excluded from calls",
      ],
      excluded_calls: ["BR", "SS"],
    });
    expect(excluded).toEqual(["BR", "SS", "WHISTLE"]);
    expect(otherWarnings).toEqual(["Something else"]);
  });

  it("returns empty when nothing excluded", () => {
    expect(
      splitParameterExcludedCalls({
        valid: true,
        errors: [],
        warnings: ["ok note"],
      }),
    ).toEqual({ excluded: [], otherWarnings: ["ok note"] });
  });
});
