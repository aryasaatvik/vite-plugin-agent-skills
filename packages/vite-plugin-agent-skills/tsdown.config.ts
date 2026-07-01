import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: false,
  sourcemap: true,
  clean: true,
  platform: "node",
  external: ["vite"],
  copy: [
    { from: "src/root.d.ts", to: "dist/root.d.ts" },
    { from: "src/ambient.d.ts", to: "dist/ambient.d.ts" },
  ],
});
