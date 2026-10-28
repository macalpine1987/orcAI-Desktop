import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");

describe("default dock · preferences wiring", () => {
  it("LabDock reads dock state from preferences", () => {
    const dock = readFileSync(join(uiSrc, "components/LabDock.tsx"), "utf8");
    expect(dock).toContain("usePreferences");
    expect(dock).toContain("defaultDockCollapsed");
    expect(dock).toContain("setDefaultDockMode");
    expect(dock).not.toContain("labDockStorage");
    // Collapse/expand must not flash «Изменения успешно сохранены».
    expect(dock).toContain("{ silent: true }");
  });

  it("Settings default dock uses setDefaultDockMode", () => {
    const panel = readFileSync(
      join(uiSrc, "pages/settings/SettingsInterfacePanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("setDefaultDockMode");
    expect(panel).not.toContain("hideOnClose");
  });
});
