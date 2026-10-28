import { describe, expect, it } from "vitest";
import { localeFromLanguageTag, migratePreferences } from "./locale";

describe("localeFromLanguageTag", () => {
  it("maps Russian tags to ru", () => {
    expect(localeFromLanguageTag("ru")).toBe("ru");
    expect(localeFromLanguageTag("ru-RU")).toBe("ru");
    expect(localeFromLanguageTag("ru_UA")).toBe("ru");
  });

  it("maps non-Russian tags to en", () => {
    expect(localeFromLanguageTag("en")).toBe("en");
    expect(localeFromLanguageTag("en-US")).toBe("en");
    expect(localeFromLanguageTag("de-DE")).toBe("en");
    expect(localeFromLanguageTag("fr")).toBe("en");
  });
});

describe("migratePreferences · first launch", () => {
  it("defaults missing locale to English, compute device to CPU, and theme to dark", () => {
    const next = migratePreferences({});
    expect(next.locale).toBe("en");
    expect(next.computeDevice).toBe("cpu");
    expect(next.theme).toBe("dark");
    expect(next.localeManual).toBe(false);
  });

  it("coerces legacy light theme to dark (dark-only product)", () => {
    const next = migratePreferences({ theme: "light" });
    expect(next.theme).toBe("dark");
  });

  it("keeps a saved Russian locale after the user changed it", () => {
    const next = migratePreferences({ locale: "ru", localeManual: true });
    expect(next.locale).toBe("ru");
    expect(next.localeManual).toBe(true);
  });

  it("keeps a saved GPU choice", () => {
    const next = migratePreferences({ computeDevice: "gpu" });
    expect(next.computeDevice).toBe("gpu");
    expect(next.locale).toBe("en");
  });
});
