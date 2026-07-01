import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: false,
  sourcemap: true,
  clean: true,
  platform: "neutral",
  external: ["vite"],
});
