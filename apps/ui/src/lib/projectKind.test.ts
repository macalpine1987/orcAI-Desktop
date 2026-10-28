import { describe, expect, it } from "vitest";
import { normalizeProjectKind } from "./projectKind";

describe("projectKind", () => {
  it("normalizes unknown values to recognition", () => {
    expect(normalizeProjectKind("training")).toBe("training");
    expect(normalizeProjectKind("recognition")).toBe("recognition");
    expect(normalizeProjectKind(null)).toBe("recognition");
    expect(normalizeProjectKind("other")).toBe("recognition");
  });
});
