import { describe, expect, it } from "vitest";
import type { OrcaiModel } from "../api/models";
import { callsForSelectedModel, classFilterRows } from "./classFilterCatalog";

const TRAINED: OrcaiModel = {
  id: "new4",
  name: "new4",
  path: "/proj/models/new4",
  kind: "trained",
  calls: ["BUZZ", "HERDING", "SS", "TAILSLAP", "WHISTLE"],
};

const BUILTIN: OrcaiModel = {
  id: "orcai-isl-v1",
  name: "orcAI ISL",
  path: "/builtin/orcai-isl-v1",
  kind: "builtin",
  calls: ["BR", "BUZZ", "HERDING", "PHS", "SS", "TAILSLAP", "WHISTLE"],
};

describe("callsForSelectedModel", () => {
  it("uses the trained model's calls, not the builtin seven", () => {
    expect(callsForSelectedModel([BUILTIN, TRAINED], "new4", TRAINED.path)).toEqual([
      "BUZZ",
      "HERDING",
      "SS",
      "TAILSLAP",
      "WHISTLE",
    ]);
  });

  it("uses builtin calls from the catalog", () => {
    expect(callsForSelectedModel([BUILTIN], "orcai-isl-v1")).toEqual(BUILTIN.calls);
  });

  it("falls back to the known builtin list only for that model id", () => {
    const bare: OrcaiModel = { ...BUILTIN, calls: undefined };
    expect(callsForSelectedModel([bare], "orcai-isl-v1")).toHaveLength(7);
    expect(callsForSelectedModel([TRAINED], "missing-id")).toBeNull();
  });
});

describe("classFilterRows", () => {
  it("lists every class of the selected model and omits the others", () => {
    const rows = classFilterRows(TRAINED.calls!, [
      { label: "WHISTLE", count: 3 },
      { label: "BR", count: 9 },
      { label: "whistles", count: 1 },
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "BUZZ",
      "HERDING",
      "SS",
      "TAILSLAP",
      "WHISTLE",
    ]);
    expect(rows.find((row) => row.label === "WHISTLE")?.count).toBe(4);
    expect(rows.some((row) => row.label === "BR")).toBe(false);
  });

  it("without a catalog shows only classes present in the file", () => {
    const rows = classFilterRows(null, [{ label: "WHISTLE", count: 2 }]);
    expect(rows).toEqual([{ label: "WHISTLE", count: 2 }]);
  });
});
