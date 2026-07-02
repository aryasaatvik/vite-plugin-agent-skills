import { describe, expect, it } from "vitest";

import { markdownImportConfig } from "../src/markdown-import";
import { skillImportConfig } from "../src/skill-import";

describe("import config", () => {
  it("keeps markdown defaults local to markdown imports", () => {
    expect(markdownImportConfig(undefined)).toEqual({
      attribute: "markdown",
      rejectSkillMarkdown: true,
    });
    expect(markdownImportConfig(false)).toBeUndefined();
  });

  it("keeps skill defaults local to skill imports", () => {
    expect(skillImportConfig({})).toEqual({
      attribute: "skill",
      transform: undefined,
      validate: "strict",
      resources: {
        gitignore: true,
        rejectSecrets: true,
        rejectSymlinks: true,
        largeFile: {
          bytes: 1_048_576,
          action: "warn",
        },
      },
    });
    expect(skillImportConfig(false)).toBeUndefined();
  });

  it("normalizes skill transforms", () => {
    expect(skillImportConfig({ transform: { importFrom: "/skill-transform.ts" } })).toMatchObject({
      transform: {
        importFrom: "/skill-transform.ts",
        importName: "transformSkill",
      },
    });
  });
});
