import { describe, expect, it } from "vitest";
import {
  draftToParameterJson,
  emptyDraft,
  parseParameterIntoDraft,
  parseWizardNumber,
} from "../trainWizard/defaults";

describe("wizard spectro number input / JSON", () => {
  it("parseWizardNumber keeps fallback for incomplete edits", () => {
    expect(parseWizardNumber("", 512)).toBe(512);
    expect(parseWizardNumber(".", 512)).toBe(512);
    expect(parseWizardNumber("-", 0.5)).toBe(0.5);
    expect(parseWizardNumber("0,99", 0)).toBeCloseTo(0.99);
    expect(parseWizardNumber("1024", 512)).toBe(1024);
  });

  it("round-trips spectro + snippets into orcAI parameter shape", () => {
    const d = emptyDraft("Demo");
    d.spectro.nfft = 1024;
    d.spectro.freq_high = 12000;
    d.spectro.snippet_duration = 2;
    d.spectro.train = 0.7;
    d.spectro.val = 0.2;
    d.spectro.test = 0.1;
    const json = draftToParameterJson(d) as {
      spectrogram: { nfft: number; duration: number; freq_range: number[] };
      snippets: { snippet_duration: number; train: number };
    };
    expect(json.spectrogram.nfft).toBe(1024);
    expect(json.spectrogram.duration).toBe(2);
    expect(json.spectrogram.freq_range).toEqual([0, 12000]);
    expect(json.snippets.snippet_duration).toBe(2);
    expect(json.snippets.train).toBeCloseTo(0.7);

    const back = parseParameterIntoDraft(emptyDraft("Demo"), json as never);
    expect(back.spectro.nfft).toBe(1024);
    expect(back.spectro.snippet_duration).toBe(2);
    expect(back.spectro.train).toBeCloseTo(0.7);
  });
});
