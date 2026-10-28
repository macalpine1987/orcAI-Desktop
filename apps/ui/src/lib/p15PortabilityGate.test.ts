import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, "..");
const styles = join(uiSrc, "styles");

function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "dist") continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.test\.(ts|tsx)$/.test(name)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("portability gate · static UI", () => {
  it("tokens.css font stack has Inter + system-ui + Segoe UI", () => {
    const css = readFileSync(join(styles, "tokens.css"), "utf8");
    expect(css).toMatch(/--font-sans:\s*"Inter"/);
    expect(css).toContain("system-ui");
    expect(css).toContain('"Segoe UI"');
    expect(css).not.toContain("-apple-system");
  });

  it("analysis-lab axes avoid -apple-system and inherit the portable sans stack", () => {
    const css = readFileSync(join(styles, "analysis-lab.css"), "utf8");
    const tokens = readFileSync(join(styles, "tokens.css"), "utf8");
    expect(css).not.toContain("-apple-system");
    expect(css).toContain("var(--font-sans");
    expect(css).toContain("system-ui");
    expect(tokens).toContain('"Segoe UI"');
  });

  it("production UI source has no platform === darwin|macos branches", () => {
    const offenders: string[] = [];
    const patterns = [
      /platform\s*===\s*["']darwin["']/,
      /platform\s*===\s*["']macos["']/,
      /platform\s*===\s*["']MacIntel["']/,
      /\bos\s*===\s*["']macos["']/,
    ];
    for (const file of collectSourceFiles(uiSrc)) {
      const rel = file.slice(uiSrc.length + 1);
      const text = readFileSync(file, "utf8");
      for (const re of patterns) {
        if (re.test(text)) offenders.push(`${rel} ~ ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("path helpers import joinFsPath (not string '/' joins for project dirs)", () => {
    const targets = [
      "workspace/project.ts",
      "workspace/predictSettings.ts",
      "pages/PipelinePage.tsx",
      "pages/ResultsPage.tsx",
    ];
    for (const rel of targets) {
      const text = readFileSync(join(uiSrc, rel), "utf8");
      expect(text, rel).toContain("joinFsPath");
      expect(text, rel).not.toMatch(/\+ ["']\/["']/);
    }
  });
});
