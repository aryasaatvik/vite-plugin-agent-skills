import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**", "**/coverage/**"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
    },
  },
});
