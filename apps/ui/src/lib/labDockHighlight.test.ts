import { describe, expect, it } from "vitest";
import { labLogLineTone, labLogLineIndentPx } from "./labDockHighlight";

describe("labLogLineTone", () => {
  it("marks Output lines as success", () => {
    expect(labLogLineTone("Output: ./result.txt")).toBe("success");
  });

  it("marks file paths as path tone", () => {
    expect(labLogLineTone("  Processing 07 Fjord Echo.wav")).toBe("path");
  });

  it("marks errors", () => {
    expect(labLogLineTone("ERROR: model load failed")).toBe("error");
  });

  it("marks warnings", () => {
    expect(labLogLineTone("WARN: low disk")).toBe("warn");
  });

  it("defaults to default tone", () => {
    expect(labLogLineTone("Running orcAI: predict")).toBe("default");
  });
});

describe("labLogLineIndentPx", () => {
  it("maps two spaces to 12px", () => {
    expect(labLogLineIndentPx("  Predicting calls")).toBe(12);
  });
});
