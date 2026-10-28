import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSpectrogramCache, factoryResetDesktop } from "./maintenance";

vi.mock("./sidecar", () => ({
  getSidecarBase: () => "http://127.0.0.1:8742",
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

describe("maintenance API", () => {
  it("clearSpectrogramCache POSTs to /v1/spectrograms/cache/clear", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ root: "/tmp/c", files_removed: 3, bytes_removed: 12 }),
      text: async () => "",
    });
    const result = await clearSpectrogramCache();
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:8742/v1/spectrograms/cache/clear",
    );
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(result.files_removed).toBe(3);
  });

  it("factoryResetDesktop POSTs to /v1/maintenance/factory-reset", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        database: {
          deleted: 2,
          cancelled_active: 0,
          projects_cleared: 1,
          project_dbs_removed: 1,
        },
        cache: { root: "/tmp/c", files_removed: 1, bytes_removed: 4 },
      }),
      text: async () => "",
    });
    const result = await factoryResetDesktop();
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:8742/v1/maintenance/factory-reset",
    );
    expect(result.database.deleted).toBe(2);
  });
});
