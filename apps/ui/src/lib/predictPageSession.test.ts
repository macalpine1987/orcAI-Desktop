import { beforeEach, describe, expect, it } from "vitest";
import {
  loadPredictActiveTab,
  normalizePredictNavTab,
  resolvePredictActiveTab,
  savePredictActiveTab,
} from "./predictPageSession";

describe("predictPageSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists and restores active tab", () => {
    savePredictActiveTab("filter");
    expect(loadPredictActiveTab()).toBe("filter");
  });

  it("defaults to run tab for unknown value", () => {
    sessionStorage.setItem("orcai.predict.activeTab", "invalid");
    expect(loadPredictActiveTab()).toBe("run");
  });

  it("migrates legacy tab ids", () => {
    sessionStorage.setItem("orcai.predict.activeTab", "spectrogram");
    expect(loadPredictActiveTab()).toBe("results");
    sessionStorage.setItem("orcai.predict.activeTab", "filter");
    expect(loadPredictActiveTab()).toBe("filter");
  });

  it("normalizePredictNavTab maps legacy navigation", () => {
    expect(normalizePredictNavTab("filter")).toBe("filter");
    expect(normalizePredictNavTab("queue")).toBe("run");
    expect(normalizePredictNavTab("run")).toBe("run");
  });

  it("resolvePredictActiveTab keeps filter while the queue is loading", () => {
    expect(
      resolvePredictActiveTab("filter", {
        queueReady: false,
        resultsEnabled: false,
        filterEnabled: false,
        queueLoading: true,
      }),
    ).toBe("filter");
  });

  it("resolvePredictActiveTab falls back when queue not ready", () => {
    expect(
      resolvePredictActiveTab("results", {
        queueReady: false,
        resultsEnabled: false,
        filterEnabled: false,
      }),
    ).toBe("run");
  });

  it("resolvePredictActiveTab falls back when filter unavailable", () => {
    expect(
      resolvePredictActiveTab("filter", {
        queueReady: true,
        resultsEnabled: true,
        filterEnabled: false,
      }),
    ).toBe("run");
  });
});
