import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, useEffect, type DragEvent as ReactDragEvent } from "react";
import type {
  ProjectAnnotations,
  ProjectArtifacts,
  ProjectParameters,
} from "../../api/projects";
import { renderWithProviders } from "../../test/render";
import { ProjectAnnotationsTab } from "./ProjectAnnotationsTab";
import { ProjectArtifactsTab } from "./ProjectArtifactsTab";
import { ProjectParametersTab } from "./ProjectParametersTab";
import { useAnnotationDropZone } from "./useAnnotationDropZone";
import { useWavDropZone } from "./useWavDropZone";

/** Drive a controlled React textarea via its fiber props (happy-dom-safe). */
async function setTextareaValue(ta: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const propsKey = Object.keys(ta).find((k) => k.startsWith("__reactProps$"));
    const props = propsKey
      ? (ta as unknown as Record<string, { onChange?: (e: { target: HTMLTextAreaElement }) => void }>)[
          propsKey
        ]
      : null;
    const proto = window.HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(ta, value);
    if (props?.onChange) {
      props.onChange({ target: ta });
      return;
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fileWithPath(path: string): File {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const file = new File(["x"], name, { type: "application/octet-stream" });
  Object.defineProperty(file, "path", { value: path, configurable: true });
  return file;
}

function fileListOf(...paths: string[]): FileList {
  const files = paths.map(fileWithPath);
  const list = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    *[Symbol.iterator]() {
      yield* files;
    },
  } as FileList;
  files.forEach((f, i) => {
    Object.defineProperty(list, i, { value: f });
  });
  return list;
}

function fakeDragEvent(files: FileList): ReactDragEvent {
  return {
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    dataTransfer: {
      files,
      dropEffect: "none",
      effectAllowed: "all",
      types: ["Files"],
      items: [] as unknown as DataTransferItemList,
      setData: () => undefined,
      getData: () => "",
      clearData: () => undefined,
      setDragImage: () => undefined,
    },
  } as unknown as ReactDragEvent;
}

type WavApi = ReturnType<typeof useWavDropZone>;
type AnnApi = ReturnType<typeof useAnnotationDropZone>;

function WavDropHarness({
  enabled,
  onDropPaths,
  onApi,
}: {
  enabled: boolean;
  onDropPaths: (paths: string[]) => void;
  onApi: (api: WavApi) => void;
}) {
  const api = useWavDropZone({ enabled, onDropPaths });
  useEffect(() => {
    onApi(api);
  }, [api, onApi]);
  return (
    <div
      ref={api.zoneRef}
      data-testid="wav-zone"
      className={api.active ? "is-drop-active" : ""}
      {...api.dropProps}
    />
  );
}

function AnnotationDropHarness({
  enabled,
  onDropPaths,
  onApi,
}: {
  enabled: boolean;
  onDropPaths: (paths: string[]) => void;
  onApi: (api: AnnApi) => void;
}) {
  const api = useAnnotationDropZone({ enabled, onDropPaths });
  useEffect(() => {
    onApi(api);
  }, [api, onApi]);
  return (
    <div
      ref={api.zoneRef}
      data-testid="ann-zone"
      className={api.active ? "is-drop-active" : ""}
      {...api.dropProps}
    />
  );
}

describe("ProjectArtifactsTab · m24", () => {
  const artifacts = (): ProjectArtifacts => ({
    project_id: "p1",
    project_dir: "/p",
    present_count: 2,
    items: [
      {
        name: "predictions",
        path: "/p/predictions",
        exists: true,
        file_count: 4,
        size_bytes: 2048,
        updated_at: 1_757_000_000,
      },
      {
        name: "tvt_data",
        path: "/p/tvt_data",
        exists: false,
        file_count: 0,
        size_bytes: 0,
        updated_at: null,
      },
    ],
  });

  it("renders artifact rows with open enabled only when folder exists", () => {
    const onOpen = vi.fn();
    const { container, unmount } = renderWithProviders(
      <ProjectArtifactsTab data={artifacts()} loading={false} onOpen={onOpen} />,
    );
    expect(container.querySelectorAll("tbody tr").length).toBe(2);
    expect(container.textContent).toMatch(/predictions\//);
    expect(container.textContent).toMatch(/tvt_data\//);
    expect(container.querySelector(".ps-footer")).toBeTruthy();

    const opens = Array.from(
      container.querySelectorAll<HTMLButtonElement>("tbody button"),
    );
    expect(opens.length).toBe(2);
    expect(opens[0].disabled).toBe(false);
    expect(opens[1].disabled).toBe(true);

    act(() => opens[0].click());
    expect(onOpen).toHaveBeenCalledWith("/p/predictions");
    act(() => opens[1].click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shows loading copy before data arrives", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectArtifactsTab data={null} loading onOpen={vi.fn()} />,
    );
    expect(container.textContent).toMatch(/Counting files|Подсчёт|загруз|load/i);
    unmount();
  });
});

describe("ProjectParametersTab · m25", () => {
  const params = (
    over: Partial<ProjectParameters> = {},
  ): ProjectParameters => ({
    project_id: "p1",
    path: "/p/Fjord_orcai_parameter.json",
    filename: "Fjord_orcai_parameter.json",
    exists: true,
    text: '{\n  "a": 1\n}',
    updated_at: 100,
    validation: { valid: true, errors: [], warnings: [] },
    ...over,
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows missing warn when parameter file is absent", () => {
    const { container, unmount } = renderWithProviders(
      <ProjectParametersTab
        data={params({ exists: false, text: "" })}
        loading={false}
        busy={false}
        onValidate={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(container.querySelector(".ps-hint-bar.is-warn")).toBeTruthy();
    expect(container.querySelector("textarea")).toBeNull();
    unmount();
  });

  it("keeps Save disabled until dirty + valid; Export always available", async () => {
    const onSave = vi.fn(async () => undefined);
    const onExport = vi.fn(async () => undefined);
    const onValidate = vi.fn(async () => ({
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
    }));
    const { container, unmount } = renderWithProviders(
      <ProjectParametersTab
        data={params()}
        loading={false}
        busy={false}
        onValidate={onValidate}
        onSave={onSave}
        onExport={onExport}
      />,
    );

    expect(container.querySelector(".ps-params-file")?.textContent).toContain(
      "Fjord_orcai_parameter.json",
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".ps-params-actions .ps-btn"),
    );
    const save = buttons.find((b) => /Сохранить|Save/i.test(b.textContent ?? ""));
    const cancel = buttons.find((b) => /Отмен|Revert/i.test(b.textContent ?? ""));
    const exp = buttons.find((b) => /Экспорт|Export/i.test(b.textContent ?? ""));
    expect(save?.disabled).toBe(true);
    expect(cancel?.disabled).toBe(true);
    expect(exp?.disabled).toBe(false);

    await act(async () => {
      exp!.click();
    });
    expect(onExport).toHaveBeenCalledWith('{\n  "a": 1\n}');

    const ta = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(ta).toBeTruthy();
    await setTextareaValue(ta!, '{\n  "a": 2\n}');
    expect(ta!.value).toBe('{\n  "a": 2\n}');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onValidate).toHaveBeenCalled();
    expect(save!.disabled).toBe(false);
    expect(cancel!.disabled).toBe(false);

    await act(async () => {
      save!.click();
    });
    expect(onSave).toHaveBeenCalledWith('{\n  "a": 2\n}');
    unmount();
  });

  it("blocks Save when live validation fails and Cancel reverts text", async () => {
    const onValidate = vi.fn(async () => ({
      valid: false,
      errors: ["bad json"],
      warnings: [] as string[],
    }));
    const onSave = vi.fn(async () => undefined);
    const { container, unmount } = renderWithProviders(
      <ProjectParametersTab
        data={params()}
        loading={false}
        busy={false}
        onValidate={onValidate}
        onSave={onSave}
        onExport={vi.fn(async () => undefined)}
      />,
    );

    const ta = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await setTextareaValue(ta, "{ broken");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(container.textContent).toContain("bad json");
    const save = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".ps-params-actions .ps-btn"),
    ).find((b) => /Сохранить|Save/i.test(b.textContent ?? ""));
    expect(save?.disabled).toBe(true);

    const cancel = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".ps-params-actions .ps-btn"),
    ).find((b) => /Отмен|Revert/i.test(b.textContent ?? ""));
    await act(async () => {
      cancel!.click();
    });
    expect(ta.value).toBe('{\n  "a": 1\n}');
    expect(onSave).not.toHaveBeenCalled();
    unmount();
  });
});

describe("Project drop zones · WAV / TXT hooks", () => {
  it("WAV: enter highlights; drop filters to .wav and sorts by name", async () => {
    const onDropPaths = vi.fn();
    let api: WavApi | null = null;
    const { container, unmount } = renderWithProviders(
      <WavDropHarness
        enabled
        onDropPaths={onDropPaths}
        onApi={(next) => {
          api = next;
        }}
      />,
    );
    await act(async () => undefined);
    expect(api).toBeTruthy();
    expect(api!.dropProps.onDrop).toBeTypeOf("function");

    await act(async () => {
      api!.dropProps.onDragEnter?.(fakeDragEvent(fileListOf()));
    });
    expect(container.querySelector(".is-drop-active")).toBeTruthy();

    await act(async () => {
      api!.dropProps.onDrop?.(
        fakeDragEvent(fileListOf("/tmp/b.wav", "/tmp/notes.txt", "/tmp/a.wav")),
      );
    });
    expect(onDropPaths).toHaveBeenCalledWith(["/tmp/a.wav", "/tmp/b.wav"]);
    expect(container.querySelector(".is-drop-active")).toBeNull();
    unmount();
  });

  it("WAV: disabled zone exposes no drop handlers", async () => {
    let api: WavApi | null = null;
    const { unmount } = renderWithProviders(
      <WavDropHarness
        enabled={false}
        onDropPaths={vi.fn()}
        onApi={(next) => {
          api = next;
        }}
      />,
    );
    await act(async () => undefined);
    expect(api!.dropProps).toEqual({});
    unmount();
  });

  it("annotations: drop keeps .txt and skips predicted/filtered/wav", async () => {
    const onDropPaths = vi.fn();
    let api: AnnApi | null = null;
    const { unmount } = renderWithProviders(
      <AnnotationDropHarness
        enabled
        onDropPaths={onDropPaths}
        onApi={(next) => {
          api = next;
        }}
      />,
    );
    await act(async () => undefined);
    await act(async () => {
      api!.dropProps.onDrop?.(
        fakeDragEvent(
          fileListOf(
            "/tmp/01.txt",
            "/tmp/01_predicted.txt",
            "/tmp/01_filtered.txt",
            "/tmp/02.wav",
          ),
        ),
      );
    });
    expect(onDropPaths).toHaveBeenCalledWith(["/tmp/01.txt"]);
    unmount();
  });

  it("Recordings/Annotations tabs wire drop zones when canModify", () => {
    const emptyAnnotations = (): ProjectAnnotations => ({
      project_id: "p1",
      classes: [],
      classes_source: "parameters",
      has_mask_columns: false,
      rows: [],
      unlisted_labels: [],
      annotated_count: 0,
      total_count: 0,
      unpaired: [],
      annotations_dir: "/p/annotations",
    });
    const ann = renderWithProviders(
      <ProjectAnnotationsTab
        data={emptyAnnotations()}
        loading={false}
        mode="full"
        busy={false}
        canModify
        onAddAnnotations={vi.fn()}
        onImportPaths={vi.fn()}
        onDeleteAnnotations={vi.fn()}
        onOpenAnnotationsFolder={vi.fn()}
      />,
    );
    expect(ann.container.querySelector(".ps-empty")).toBeTruthy();
    expect(ann.container.querySelector(".ps-empty-drop-hint")).toBeTruthy();
    ann.unmount();
  });
});
