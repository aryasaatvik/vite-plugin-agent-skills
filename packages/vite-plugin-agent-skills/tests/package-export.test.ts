import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };

describe("package exports", () => {
  it("points at the Node ESM build artifact names", () => {
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.mjs",
    });
  });
});
