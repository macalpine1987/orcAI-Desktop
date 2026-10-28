import { describe, expect, it } from "vitest";
import {
  normalizeDataHealth,
  pickDataHealthMessage,
} from "./projectDataHealth";

describe("pickDataHealthMessage", () => {
  it("returns null when healthy", () => {
    expect(
      pickDataHealthMessage(
        {
          table_stale: false,
          missing_wav: 0,
          unpaired_ann: 0,
          ann_gap: 0,
        },
        "full",
      ),
    ).toBeNull();
  });

  it("prioritizes table_stale over missing_wav", () => {
    const pick = pickDataHealthMessage(
      {
        table_stale: true,
        missing_wav: 3,
        unpaired_ann: 2,
        ann_gap: 1,
      },
      "recognition",
    );
    expect(pick?.code).toBe("table_stale");
    expect(pick?.messageKey).toBe("shellHealth.tableStale");
  });

  it("shows missing_wav for recognition", () => {
    const pick = pickDataHealthMessage(
      {
        table_stale: false,
        missing_wav: 2,
        unpaired_ann: 9,
        ann_gap: 9,
      },
      "recognition",
    );
    expect(pick?.code).toBe("missing_wav");
    expect(pick?.count).toBe(2);
  });

  it("ignores unpaired/ann_gap for recognition focus", () => {
    expect(
      pickDataHealthMessage(
        {
          table_stale: false,
          missing_wav: 0,
          unpaired_ann: 4,
          ann_gap: 5,
        },
        "recognition",
      ),
    ).toBeNull();
  });

  it("shows unpaired then ann_gap for training/full", () => {
    expect(
      pickDataHealthMessage(
        {
          table_stale: false,
          missing_wav: 0,
          unpaired_ann: 3,
          ann_gap: 7,
        },
        "training",
      )?.code,
    ).toBe("unpaired_ann");
    expect(
      pickDataHealthMessage(
        {
          table_stale: false,
          missing_wav: 0,
          unpaired_ann: 0,
          ann_gap: 7,
        },
        "full",
      ),
    ).toEqual({
      code: "ann_gap",
      count: 7,
      messageKey: "shellHealth.annGap",
    });
  });

  it("normalizeDataHealth clamps bad payloads", () => {
    expect(normalizeDataHealth(null)).toEqual({
      table_stale: false,
      missing_wav: 0,
      unpaired_ann: 0,
      ann_gap: 0,
    });
    expect(
      normalizeDataHealth({
        table_stale: true,
        missing_wav: -1 as unknown as number,
        unpaired_ann: 1.8 as unknown as number,
      }),
    ).toEqual({
      table_stale: true,
      missing_wav: 0,
      unpaired_ann: 1,
      ann_gap: 0,
    });
  });

  it("skips dismissed codes and surfaces the next priority (no silence trap)", () => {
    const health = {
      table_stale: true,
      missing_wav: 2,
      unpaired_ann: 0,
      ann_gap: 0,
    };
    expect(
      pickDataHealthMessage(health, "recognition", ["table_stale"])?.code,
    ).toBe("missing_wav");
    expect(
      pickDataHealthMessage(health, "recognition", [
        "table_stale",
        "missing_wav",
      ]),
    ).toBeNull();
  });
});
