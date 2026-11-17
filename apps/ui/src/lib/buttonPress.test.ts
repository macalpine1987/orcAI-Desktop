import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = join(dirname(fileURLToPath(import.meta.url)), "..", "styles");

describe("button press", () => {
  it("depresses every enabled button without replacing its own transform", () => {
    const css = readFileSync(join(styles, "instrument.css"), "utf8");
    const press = css.slice(css.indexOf("@keyframes button-press"));
    expect(press).toContain("translate: 0 1px;");
    expect(press).toContain("scale: 0.985;");
    expect(press).toContain(
      "button:active:not(:disabled)",
    );
    expect(press).toContain("animation: button-press 80ms ease-out forwards;");
  });
});
