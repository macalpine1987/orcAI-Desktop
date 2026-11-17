import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchProjectSummary = vi.hoisted(() => vi.fn());

vi.mock("../api/projects", () => ({
  fetchProjectSummary: (...args: unknown[]) => fetchProjectSummary(...args),
}));

import { loadProjectSummary } from "./useProjectSummary";

describe("project summary cache", () => {
  beforeEach(() => {
    fetchProjectSummary.mockReset();
  });

  it("shares one request for concurrent reads and bypasses it when fresh", async () => {
    const id = `summary-${Date.now()}`;
    let release: ((value: { id: string }) => void) | undefined;
    fetchProjectSummary.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = loadProjectSummary(id, false);
    const second = loadProjectSummary(id, false);
    expect(second).toBe(first);
    expect(fetchProjectSummary).toHaveBeenCalledTimes(1);
    release?.({ id });
    await expect(first).resolves.toEqual({ id });

    fetchProjectSummary.mockResolvedValue({ id, next: true });
    await expect(loadProjectSummary(id, false)).resolves.toEqual({ id });
    expect(fetchProjectSummary).toHaveBeenCalledTimes(1);

    await loadProjectSummary(id, true);
    expect(fetchProjectSummary).toHaveBeenLastCalledWith(id, { fresh: true });
  });
});
