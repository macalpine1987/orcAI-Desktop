import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".vitest-cache",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/platform/**/*.test.ts"],
  },
});
