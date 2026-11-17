import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchModels, peekModels } from "./models";

describe("models list cache", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ models: [{ id: "m1", name: "one" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  it("reuses the list for four seconds and skips the cache when fresh", async () => {
    const dir = `/models-cache-${Date.now()}`;
    expect(peekModels(dir)).toBeNull();
    const first = await fetchModels(dir);
    expect(peekModels(dir)).toEqual(first);
    await fetchModels(dir);
    expect(fetch).toHaveBeenCalledTimes(1);
    const again = await fetchModels(dir, { fresh: true });
    expect(again).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
