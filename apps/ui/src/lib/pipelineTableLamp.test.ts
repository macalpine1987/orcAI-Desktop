import { describe, expect, it } from "vitest";
import { pipelineTableDetailKey } from "./pipelineTableLamp";

describe("pipeline table lamp copy", () => {
  it("uses the current phrase only for a green current table", () => {
    expect(pipelineTableDetailKey("current", "ok")).toBe("pipeline.ready.tableSub");
  });

  it("does not call a stale or missing table current", () => {
    expect(pipelineTableDetailKey("stale", "warn")).toBe("pipeline.ready.tableStale");
    expect(pipelineTableDetailKey("missing", "warn")).toBe("pipeline.ready.tableMissing");
    expect(pipelineTableDetailKey("missing", "off")).toBe("pipeline.ready.tableMissing");
    expect(pipelineTableDetailKey("current", "off")).toBe("pipeline.ready.tableEmpty");
  });

  it("keeps the current phrase when an older snapshot has no sync field", () => {
    expect(pipelineTableDetailKey(undefined, "ok")).toBe("pipeline.ready.tableSub");
  });
});
