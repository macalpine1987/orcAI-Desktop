import { describe, expect, it } from "vitest";
import { isAppLocale } from "./localeSync";

describe("localeSync", () => {
  it("accepts only en/ru", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("ru")).toBe(true);
    expect(isAppLocale("de")).toBe(false);
    expect(isAppLocale("")).toBe(false);
    expect(isAppLocale(null)).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
  });
});
