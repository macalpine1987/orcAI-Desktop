import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  draftToParameterJson,
  emptyDraft,
  FACTORY_MODEL,
  parseParameterIntoDraft,
} from "../trainWizard/defaults";

/** Keys in orcAI ``default_orcai_parameter.json`` (bundled with Desktop). */
const DEFAULT_PARAM_PATH = resolve(
  __dirname,
  "../../../../src-tauri/resources/python/venv/lib/python3.11/site-packages/orcai/defaults/default_orcai_parameter.json",
);

function loadDefaultParam(): Record<string, unknown> {
  return JSON.parse(readFileSync(DEFAULT_PARAM_PATH, "utf-8")) as Record<
    string,
    unknown
  >;
}

describe("wizard → orcai_parameter.json", () => {
  it("factory draft matches default_orcai_parameter shape and key values", () => {
    const orcaiDefault = loadDefaultParam();
    const draft = emptyDraft("Demo");
    draft.classes = (
      (orcaiDefault.calls as string[]) || ["SS"]
    ).map((id) => ({
      id,
      count: 1,
      recordings: 1,
      duration_sec: 1,
      coverage: 1,
      selected: true,
    }));
    const json = draftToParameterJson(draft) as Record<string, unknown>;
    const model = json.model as Record<string, unknown>;
    const spectro = json.spectrogram as Record<string, unknown>;
    const snippets = json.snippets as Record<string, unknown>;
    const defModel = orcaiDefault.model as Record<string, unknown>;
    const defSpectro = orcaiDefault.spectrogram as Record<string, unknown>;
    const defSnippets = orcaiDefault.snippets as Record<string, unknown>;

    expect(Object.keys(json).sort()).toEqual(
      ["architecture", "calls", "model", "name", "seed", "snippets", "spectrogram"].sort(),
    );
    expect(Object.keys(model).sort()).toEqual(Object.keys(defModel).sort());
    expect(Object.keys(spectro).sort()).toEqual(Object.keys(defSpectro).sort());
    expect(Object.keys(snippets).sort()).toEqual(Object.keys(defSnippets).sort());

    expect(json.architecture).toBe(orcaiDefault.architecture);
    expect(model.epochs).toBe(defModel.epochs);
    expect(model.batch_size).toBe(defModel.batch_size);
    expect(model.filters).toEqual(defModel.filters);
    expect(model.conv_initializer).toBe(defModel.conv_initializer);
    // Desktop wizard defaults use publication kernel/dropout (5 / 0.3), not
    // package default_orcai_parameter (3 / 0.5).
    expect(model.kernel_size).toBe(5);
    expect(model.dropout_rate).toBe(0.3);
    expect(FACTORY_MODEL.kernel_size).toBe(5);
    expect(FACTORY_MODEL.dropout_rate).toBe(0.3);
    expect(model.lstm_units).toBe(defModel.lstm_units);
    expect(model.lstm_initializer).toBe(defModel.lstm_initializer);
    expect(model.n_batch_train).toBe(defModel.n_batch_train);
    expect(model.n_batch_val).toBe(defModel.n_batch_val);
    expect(model.n_batch_test).toBe(defModel.n_batch_test);
    expect(model.shuffle).toBe(defModel.shuffle);
    expect(model.learning_rate).toBeCloseTo(Number(defModel.learning_rate));
    expect(model.EarlyStopping_patience).toBe(defModel.EarlyStopping_patience);
    expect(model.ReduceLROnPlateau_patience).toBe(
      defModel.ReduceLROnPlateau_patience,
    );
    expect(model.ReduceLROnPlateau_factor).toBe(defModel.ReduceLROnPlateau_factor);
    expect(model.ReduceLROnPlateau_min_learning_rate).toBeCloseTo(
      Number(defModel.ReduceLROnPlateau_min_learning_rate),
    );
    expect(model.call_weights).toBeNull();
    expect(model.monitor).toBe(defModel.monitor);

    expect(spectro.sampling_rate).toBe(defSpectro.sampling_rate);
    expect(spectro.nfft).toBe(defSpectro.nfft);
    expect(spectro.n_overlap).toBe(defSpectro.n_overlap);
    expect(spectro.freq_range).toEqual(defSpectro.freq_range);
    expect(spectro.quantiles).toEqual(defSpectro.quantiles);
    expect(spectro.duration).toBe(defSpectro.duration);

    expect(snippets).toEqual(defSnippets);
    expect(FACTORY_MODEL.shuffle).toBe(true);
    expect(FACTORY_MODEL.reduce_lr_min_learning_rate).toBe("1e-7");
  });

  it("round-trips every model / spectro / snippets field through parse", () => {
    const draft = emptyDraft("Round");
    draft.classes = [
      {
        id: "SS",
        count: 10,
        recordings: 2,
        duration_sec: 5,
        coverage: 1,
        selected: true,
      },
      {
        id: "BR",
        count: 3,
        recordings: 1,
        duration_sec: 1,
        coverage: 0.5,
        selected: false,
      },
    ];
    draft.model.conv_initializer = "glorot_normal";
    draft.model.lstm_initializer = "orthogonal";
    draft.model.reduce_lr_min_learning_rate = "1e-6";
    draft.model.call_weights = "balanced";
    draft.model.shuffle = false;
    draft.model.learning_rate = "2.5e-4";
    draft.spectro.nfft = 1024;
    draft.spectro.n_overlap = 512;
    draft.spectro.fraction_removal = 0.5;

    const json = draftToParameterJson(draft) as Record<string, unknown>;
    const model = json.model as Record<string, unknown>;
    expect(model.conv_initializer).toBe("glorot_normal");
    expect(model.lstm_initializer).toBe("orthogonal");
    expect(model.ReduceLROnPlateau_min_learning_rate).toBeCloseTo(1e-6);
    expect(model.call_weights).toBe("balanced");
    expect(model.shuffle).toBe(false);
    expect(model.learning_rate).toBeCloseTo(2.5e-4);
    expect(json.calls).toEqual(["SS"]);

    const back = parseParameterIntoDraft(emptyDraft("Round"), json);
    expect(back.model.conv_initializer).toBe("glorot_normal");
    expect(back.model.lstm_initializer).toBe("orthogonal");
    expect(Number(back.model.reduce_lr_min_learning_rate)).toBeCloseTo(1e-6);
    expect(back.model.call_weights).toBe("balanced");
    expect(back.model.shuffle).toBe(false);
    expect(Number(back.model.learning_rate)).toBeCloseTo(2.5e-4);
    expect(back.spectro.nfft).toBe(1024);
    expect(back.spectro.fraction_removal).toBeCloseTo(0.5);
  });

  it("maps call_weights none → JSON null", () => {
    const draft = emptyDraft("W");
    draft.model.call_weights = "none";
    const json = draftToParameterJson(draft) as { model: { call_weights: unknown } };
    expect(json.model.call_weights).toBeNull();
    const back = parseParameterIntoDraft(emptyDraft("W"), json as never);
    expect(back.model.call_weights).toBe("none");
  });
});
