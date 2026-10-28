import { describe, expect, it } from "vitest";
import { neighborWavPaths } from "./spectrogramNeighborWarm";

describe("neighborWavPaths", () => {
  const files = [
    { path: "/a.wav", kind: "wav" as const },
    { path: "/b.wav", kind: "wav" as const },
    { path: "/c.wav", kind: "wav" as const },
  ];

  it("returns previous and next for a middle file", () => {
    expect(neighborWavPaths(files, "/b.wav")).toEqual(["/a.wav", "/c.wav"]);
  });

  it("returns only next at the start", () => {
    expect(neighborWavPaths(files, "/a.wav")).toEqual(["/b.wav"]);
  });

  it("returns only previous at the end", () => {
    expect(neighborWavPaths(files, "/c.wav")).toEqual(["/b.wav"]);
  });

  it("skips non-wav entries", () => {
    const mixed = [
      { path: "/table.csv", kind: "csv_table" as const },
      { path: "/a.wav", kind: "wav" as const },
      { path: "/b.wav", kind: "wav" as const },
    ];
    expect(neighborWavPaths(mixed, "/a.wav")).toEqual(["/b.wav"]);
  });
});
