import { describe, expect, it } from "vitest";
import {
  countSynonymRules,
  ensureIdentity,
  formatEquivalencesJson,
  mapFromSynonymsByClass,
  MAX_SYNONYMS_PER_CLASS,
  parseEquivalencesJson,
  parseSynonymInput,
  pickEquivalencesAfterLoad,
  publicationNamesFromEquivalences,
  replaceClassSynonyms,
  synonymsByClassFromMap,
} from "./equivalences";

describe("equivalences helpers", () => {
  it("round-trips one synonym per class ↔ map", () => {
    const byClass = {
      SS: ["N1"],
      BUZZ: ["buzz"],
      PHS: [],
    };
    const map = mapFromSynonymsByClass(byClass, ["SS", "BUZZ", "PHS"]);
    expect(map).toEqual({
      SS: "SS",
      N1: "SS",
      BUZZ: "BUZZ",
      buzz: "BUZZ",
      PHS: "PHS",
    });
    expect(synonymsByClassFromMap(map, ["SS", "BUZZ", "PHS"])).toEqual(byClass);
    expect(publicationNamesFromEquivalences(map)).toEqual({
      SS: "N1",
      BUZZ: "buzz",
    });
    expect(countSynonymRules(map)).toBe(2);
  });

  it(`caps Desktop UI at ${MAX_SYNONYMS_PER_CLASS} synonym per class`, () => {
    const map = mapFromSynonymsByClass(
      { SS: ["N1", "pulsed", "extra"] },
      ["SS"],
    );
    expect(map).toEqual({ SS: "SS", N1: "SS" });
    expect(
      replaceClassSynonyms({ SS: "SS" }, "SS", ["N1", "pulsed"], ["SS"]),
    ).toEqual({ SS: "SS", N1: "SS" });
  });

  it("ensureIdentity drops mappings to unselected classes", () => {
    const map = ensureIdentity(
      { N1: "SS", SS: "SS", buzz: "BUZZ", BUZZ: "BUZZ" },
      ["SS"],
    );
    expect(map).toEqual({ N1: "SS", SS: "SS" });
  });

  it("parse / format JSON", () => {
    const text = formatEquivalencesJson({ buzz: "BUZZ", BUZZ: "BUZZ" });
    expect(parseEquivalencesJson(text)).toEqual({ buzz: "BUZZ", BUZZ: "BUZZ" });
  });

  it("replaceClassSynonyms / parseSynonymInput for inline table edit", () => {
    expect(parseSynonymInput(" N1, pulsed ; buzz ")).toEqual([
      "N1",
      "pulsed",
      "buzz",
    ]);
    const map = replaceClassSynonyms(
      { SS: "SS", N1: "SS", BUZZ: "BUZZ" },
      "SS",
      ["N1", "pulsed"],
      ["SS", "BUZZ"],
    );
    expect(map).toEqual({
      SS: "SS",
      N1: "SS",
      BUZZ: "BUZZ",
    });
    const cleared = replaceClassSynonyms(map, "SS", [], ["SS", "BUZZ"]);
    expect(cleared).toEqual({ SS: "SS", BUZZ: "BUZZ" });
  });

  it("rejects synonym equal to another class id (orcAI identity)", () => {
    const map = replaceClassSynonyms(
      { SS: "SS", BUZZ: "BUZZ" },
      "SS",
      ["BUZZ", "N1"],
      ["SS", "BUZZ"],
    );
    expect(map).toEqual({ SS: "SS", N1: "SS", BUZZ: "BUZZ" });
  });

  it("rejects synonym already owned by another class", () => {
    const map = replaceClassSynonyms(
      { SS: "SS", N1: "SS", BUZZ: "BUZZ" },
      "BUZZ",
      ["N1", "buzz"],
      ["SS", "BUZZ"],
    );
    expect(map).toEqual({
      SS: "SS",
      N1: "SS",
      BUZZ: "BUZZ",
      buzz: "BUZZ",
    });
  });

  it("pickEquivalencesAfterLoad keeps local edits when gen bumped during load", () => {
    const prev = { SS: "SS", N1: "SS" };
    const loaded = { SS: "SS", BUZZ: "BUZZ" };
    expect(
      pickEquivalencesAfterLoad({
        loadedEq: loaded,
        prevMap: prev,
        genAtLoadStart: 1,
        genNow: 2,
      }),
    ).toEqual(prev);
    expect(
      pickEquivalencesAfterLoad({
        loadedEq: loaded,
        prevMap: prev,
        genAtLoadStart: 1,
        genNow: 1,
      }),
    ).toEqual(loaded);
    expect(
      pickEquivalencesAfterLoad({
        loadedEq: {},
        prevMap: prev,
        genAtLoadStart: 0,
        genNow: 0,
      }),
    ).toEqual(prev);
  });
});
