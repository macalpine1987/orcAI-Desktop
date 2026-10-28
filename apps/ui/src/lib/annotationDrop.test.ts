import { describe, expect, it } from "vitest";
import {
  filterAnnotationPaths,
  isAnnotationPath,
  isPredictExportPath,
} from "./annotationDrop";

describe("annotationDrop", () => {
  it("accepts Audacity .txt and rejects predict/filter exports", () => {
    expect(isAnnotationPath("/tmp/a.txt")).toBe(true);
    expect(isAnnotationPath("/tmp/a_predicted.txt")).toBe(false);
    expect(isAnnotationPath("/tmp/a_filtered.txt")).toBe(false);
    expect(isAnnotationPath("/tmp/a.wav")).toBe(false);
    expect(isPredictExportPath("/tmp/a_c1_orcai-isl-v1_predicted.txt")).toBe(true);
    expect(isPredictExportPath("/tmp/a.txt")).toBe(false);
  });

  it("filters, dedupes, and sorts by filename", () => {
    expect(
      filterAnnotationPaths([
        "/data/b.txt",
        "/data/a.txt",
        "/data/a.txt",
        "/data/x_predicted.txt",
        "/data/c.wav",
      ]),
    ).toEqual(["/data/a.txt", "/data/b.txt"]);
  });
});
