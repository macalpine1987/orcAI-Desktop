import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { happyDomAlias } from "./vitest-happy-dom.mjs";

/**
 * Same projects as ``vitest.config.mjs`` (npm test / watch).
 * Keep both in sync so a bare ``vitest`` pick of ``*.ts`` still runs components.
 */
export default defineConfig({
  plugins: [react()],
  cacheDir: ".vitest-cache",
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          setupFiles: ["src/test/setup.ts"],
          include: ["src/**/*.test.ts", "src/platform/**/*.test.ts"],
        },
      },
      {
        extends: true,
        resolve: { alias: happyDomAlias() },
        test: {
          name: "components",
          environment: "node",
          setupFiles: ["src/test/setup.ts", "src/test/setup-happy-dom.ts"],
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
