import { describe, expect, it, vi } from "vitest";
import { formatTfBoundsNotice } from "./spectrogramTfBoundsNotice";

describe("formatTfBoundsNotice", () => {
  const t = vi.fn((key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key,
  );

  it("returns null when meta is empty", () => {
    expect(formatTfBoundsNotice(null, t)).toBeNull();
    expect(formatTfBoundsNotice({ computed: 5, skipped: 0, warnings: [] }, t)).toBeNull();
  });

  it("reports skipped segments", () => {
    const msg = formatTfBoundsNotice(
      { computed: 10, skipped: 2, warnings: [] },
      t,
    );
    expect(msg).toContain("spectrogram.tfBounds.skipped");
  });
});
