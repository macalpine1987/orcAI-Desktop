import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectParameters } from "../api/projects";
import { renderWithProviders } from "../test/render";
import { PipelineParamsModal } from "./PipelineParamsModal";

vi.mock("../api/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/projects")>();
  return {
    ...actual,
    fetchProjectParameters: vi.fn(),
    validateProjectParameters: vi.fn(),
    saveProjectParameters: vi.fn(),
  };
});

const api = await import("../api/projects");

const sample = (): ProjectParameters => ({
  project_id: "p1",
  path: "/p/Fjord_orcai_parameter.json",
  filename: "Fjord_orcai_parameter.json",
  exists: true,
  text: '{\n  "a": 1\n}',
  updated_at: 100,
  validation: { valid: true, errors: [], warnings: [] },
});

describe("PipelineParamsModal", () => {
  beforeEach(() => {
    vi.mocked(api.fetchProjectParameters).mockReset();
    vi.mocked(api.saveProjectParameters).mockReset();
    vi.mocked(api.validateProjectParameters).mockReset();
    vi.mocked(api.validateProjectParameters).mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it("loads JSON in place and does not leave Training", async () => {
    vi.mocked(api.fetchProjectParameters).mockResolvedValue(sample());
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const { unmount } = renderWithProviders(
      <PipelineParamsModal open projectId="p1" onClose={onClose} onSaved={onSaved} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toMatch(/Параметры проекта|Project parameters/);
    expect(document.querySelector("textarea")?.value).toContain('"a": 1');
    expect(api.fetchProjectParameters).toHaveBeenCalledWith("p1");
    unmount();
  });

  it("save writes the same sidecar file and notifies the board", async () => {
    const doc = sample();
    vi.mocked(api.fetchProjectParameters).mockResolvedValue(doc);
    vi.mocked(api.saveProjectParameters).mockResolvedValue({
      ...doc,
      text: '{\n  "a": 2\n}',
      updated_at: 200,
    });
    const onSaved = vi.fn();
    const { unmount } = renderWithProviders(
      <PipelineParamsModal open projectId="p1" onClose={vi.fn()} onSaved={onSaved} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const ta = document.querySelector("textarea");
    expect(ta).toBeTruthy();
    await act(async () => {
      const propsKey = Object.keys(ta as object).find((k) => k.startsWith("__reactProps$"));
      const props = propsKey
        ? (
            ta as unknown as Record<
              string,
              { onChange?: (e: { target: HTMLTextAreaElement }) => void }
            >
          )[propsKey]
        : null;
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set?.call(
        ta,
        '{\n  "a": 2\n}',
      );
      props?.onChange?.({ target: ta as HTMLTextAreaElement });
    });
    const save = [...document.querySelectorAll("button")].find((b) =>
      /Сохранить|Save/i.test(b.textContent ?? ""),
    );
    expect(save).toBeTruthy();
    await act(async () => {
      save?.click();
    });
    expect(api.saveProjectParameters).toHaveBeenCalledWith("p1", '{\n  "a": 2\n}');
    expect(onSaved).toHaveBeenCalled();
    unmount();
  });
});
