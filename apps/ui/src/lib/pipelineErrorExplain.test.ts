import { describe, expect, it } from "vitest";
import {
  classifyPipelineError,
  pipelineErrorCopy,
} from "./pipelineErrorExplain";

describe("classifyPipelineError", () => {
  it("detects GZIP/TFRecord inflate failures", () => {
    const raw = `Graph execution error: Detected at node IteratorGetNext
inflate() failed with error -3: incorrect header check
[[{{node IteratorGetNext}}]]`;
    expect(classifyPipelineError(raw)).toBe("tvt_gzip_corrupt");
  });

  it("detects cancel, OOM, disk, snippets, mask, and exists", () => {
    expect(classifyPipelineError("Cancelled by user")).toBe("cancelled");
    expect(classifyPipelineError("ResourceExhaustedError: OOM")).toBe("oom");
    expect(classifyPipelineError("CUDA out of memory")).toBe("oom");
    expect(classifyPipelineError("OSError: [Errno 28] No space left on device")).toBe(
      "disk_full",
    );
    expect(
      classifyPipelineError(
        "Number of train snippets (400) larger than available snippets (120).",
      ),
    ).toBe("snippets_shortage");
    expect(
      classifyPipelineError("Cannot mask with non-boolean array containing NA / NaN"),
    ).toBe("cannot_mask_na");
    expect(
      classifyPipelineError("Folder /tmp/x already exists. Set overwrite=True to overwrite."),
    ).toBe("already_exists");
  });

  it("detects spectrogram / labels / model / architecture / sys.exit", () => {
    expect(
      classifyPipelineError("File not found: …/times.json\nDid you create the spectrogram?"),
    ).toBe("missing_spectrogram");
    expect(classifyPipelineError("Label file not found: foo — missing label files")).toBe(
      "missing_labels",
    );
    expect(
      classifyPipelineError(
        "Couldn't find model weights (model_weights.h5) or keras model file in /m",
      ),
    ).toBe("model_missing");
    expect(classifyPipelineError("Unknown model architecture: foo")).toBe("architecture");
    expect(classifyPipelineError("Engine exited (sys.exit): 1")).toBe("engine_sys_exit");
    expect(
      classifyPipelineError(
        "Call weights do not match label calls. Please check the call weights file.",
      ),
    ).toBe("call_weights");
  });

  it("returns generic for unknown text", () => {
    expect(classifyPipelineError("something totally new")).toBe("generic");
    expect(classifyPipelineError(null)).toBe("generic");
  });

  it("provides RU/EN remediation copy for every kind", () => {
    const kinds = [
      "tvt_gzip_corrupt",
      "cancelled",
      "oom",
      "disk_full",
      "snippets_shortage",
      "call_weights",
      "missing_spectrogram",
      "missing_labels",
      "already_exists",
      "engine_sys_exit",
      "model_missing",
      "architecture",
      "cannot_mask_na",
      "permission",
      "not_found",
      "shape_mismatch",
      "generic",
    ] as const;
    for (const kind of kinds) {
      for (const lang of ["ru", "en"] as const) {
        const copy = pipelineErrorCopy(kind, lang);
        expect(copy.title.length).toBeGreaterThan(4);
        expect(copy.body.length).toBeGreaterThan(10);
        expect(copy.steps.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
