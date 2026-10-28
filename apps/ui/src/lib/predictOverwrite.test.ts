import { describe, expect, it } from "vitest";
import {
  expectedPredictOutputPath,
  isAnnotationExistsError,
  parseAnnotationExistsPath,
  resolveCsvBatchCustomOutputPath,
} from "./predictOverwrite";

describe("predictOverwrite", () => {
  it("detects annotation exists errors", () => {
    expect(
      isAnnotationExistsError(
        "FileExistsError: Annotation file already exists: /tmp/a_predicted.txt",
      ),
    ).toBe(true);
    expect(isAnnotationExistsError("Something else failed")).toBe(false);
  });

  it("parses output path from error text", () => {
    const err = `Output file: /rec/clip_c1_orcai-isl-v1_predicted.txt
Error: Annotation file already exists: /rec/clip_c1_orcai-isl-v1_predicted.txt`;
    expect(parseAnnotationExistsPath(err)).toBe(
      "/rec/clip_c1_orcai-isl-v1_predicted.txt",
    );
  });

  it("infers default predict output path", () => {
    expect(
      expectedPredictOutputPath(
        "/rec/clip.wav",
        1,
        "orcai-isl-v1",
        "orcai-isl-v1",
        "default",
      ),
    ).toBe("/rec/clip_c1_orcai-isl-v1_predicted.txt");
  });

  it("maps custom -o CSV batch to per-recording file under the directory", () => {
    expect(
      resolveCsvBatchCustomOutputPath(
        "/rec/clip.wav",
        "/out",
        "orcai-isl-v1",
      ),
    ).toBe("/out/clip_orcai-isl-v1_predicted.txt");
    expect(
      expectedPredictOutputPath(
        "/rec/clip.wav",
        2,
        "orcai-isl-v1",
        "Display Name",
        "/out",
        { csvBatch: true },
      ),
    ).toBe("/out/clip_orcai-isl-v1_predicted.txt");
    expect(
      expectedPredictOutputPath(
        "/rec/clip.wav",
        2,
        "orcai-isl-v1",
        "orcai-isl-v1",
        "/out/all.txt",
      ),
    ).toBe("/out/all.txt");
  });
});
