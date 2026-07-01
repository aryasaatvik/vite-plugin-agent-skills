import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };

describe("package exports", () => {
  it("points at the Node ESM build artifact names", () => {
    expect(packageJson.types).toBe("./dist/root.d.ts");
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/root.d.ts",
      import: "./dist/index.mjs",
    });
  });
});
