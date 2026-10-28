import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** First existing happy-dom install (local node_modules, then shared cache). */
export function resolveHappyDomPath() {
  const candidates = [
    path.join(root, "node_modules/happy-dom"),
    "/tmp/orcai-ui-test-deps/node_modules/happy-dom",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[1];
}

export function happyDomAlias() {
  return { "happy-dom": resolveHappyDomPath() };
}
