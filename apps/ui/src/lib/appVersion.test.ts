import { describe, expect, it } from "vitest";
import { APP_VERSION, formatAppVersion } from "./appVersion";

describe("formatAppVersion", () => {
  it("prefixes bare semver with v", () => {
    expect(formatAppVersion("0.1.1")).toBe("v0.1.1");
  });

  it("keeps existing v prefix", () => {
    expect(formatAppVersion("v2.0.0")).toBe("v2.0.0");
  });

  it("matches package.json version", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(formatAppVersion()).toBe(`v${APP_VERSION}`);
  });
});
