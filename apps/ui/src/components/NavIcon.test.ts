import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "../layout/navigation";

const navIconSrc = readFileSync(
  join(import.meta.dirname, "NavIcon.tsx"),
  "utf8",
);

describe("NavIcon · m16 sidebar set", () => {
  it("defines a glyph block for every nav item", () => {
    for (const item of NAV_ITEMS) {
      expect(navIconSrc).toContain(`${item.id}:`);
    }
  });

  it("uses thin outline stroke for sidebar icons", () => {
    expect(navIconSrc).toContain("strokeWidth: 1.5");
  });

  it("draws settings as a six-tooth gear and leaves the other glyphs", () => {
    const settings = navIconSrc.slice(
      navIconSrc.indexOf("settings:"),
      navIconSrc.indexOf("help:"),
    );
    expect(settings).toContain('cx="12" cy="12" r="3"');
    expect(settings).toContain(
      'd="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"',
    );
    expect(settings).not.toContain("M12 2v2");
    expect(navIconSrc).toContain(
      'd="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"',
    );
    expect(navIconSrc).toContain('d="M9 6h11M9 12h11M9 18h11"');
    expect(navIconSrc).toContain(
      'd="M9.5 9.5a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.5-1.7 2.7"',
    );
  });
});
