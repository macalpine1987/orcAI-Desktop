import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = join(dirname(fileURLToPath(import.meta.url)), "..", "styles");

function read(file: string): string {
  return readFileSync(join(styles, file), "utf8");
}

function columnRule(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("results and models column scrollbar gutter", () => {
  it("reserves no scrollbar slot on the results and models columns", () => {
    for (const [file, selector] of [
      ["results-studio.css", ".app-viewport--results-studio .mat-shell-main--results-studio"],
      ["models-studio.css", ".app-viewport--models-studio .mat-shell-main--models-studio"],
    ] as const) {
      const body = columnRule(read(file), selector);
      const background = body.indexOf("background:");
      const gutter = body.indexOf("scrollbar-gutter: auto");
      expect(background).toBeGreaterThan(-1);
      expect(gutter).toBeGreaterThan(background);
      expect(body.slice(background, gutter)).toMatch(/background:\s*var\(--mat-canvas\);\s*$/);
      expect(body).not.toContain("scrollbar-gutter: stable");
    }
  });

  it("leaves the shared analysis column gutter unchanged", () => {
    const shared = columnRule(read("analysis-lab.css"), ".mat-shell-main");
    expect(shared).toContain("scrollbar-gutter: stable");
    expect(shared).not.toContain("scrollbar-gutter: auto");
  });
});
