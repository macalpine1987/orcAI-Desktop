import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../styles");

/** Resolve analysis-lab.css barrel @imports into one string (gate tests). */
export function readAnalysisLabCss(): string {
  const barrel = readFileSync(join(stylesDir, "analysis-lab.css"), "utf8");
  const parts: string[] = [barrel];
  for (const line of barrel.split("\n")) {
    const m = line.match(/@import\s+["']\.\/([^"']+)["']/);
    if (!m) continue;
    parts.push(readFileSync(join(stylesDir, m[1]!), "utf8"));
  }
  return parts.join("\n");
}
