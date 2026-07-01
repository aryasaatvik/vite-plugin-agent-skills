import { describe, expect, it } from "vitest";

import { markdownImportConfig } from "../src/markdown-import";
import { skillImportConfig } from "../src/skill-import";

describe("import config", () => {
  it("keeps markdown defaults local to markdown imports", () => {
    expect(markdownImportConfig(undefined)).toEqual({
      enabled: true,
      attribute: "markdown",
      rejectSkillMarkdown: true,
    });
    expect(markdownImportConfig(false)).toEqual({ enabled: false });
  });

  it("keeps skill defaults local to skill imports", () => {
    expect(skillImportConfig({ mode: "manifest" })).toEqual({
      enabled: true,
      attribute: "skill",
      mode: "manifest",
      runtime: {
        importFrom: "agents/skills",
        fromManifest: "fromManifest",
      },
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
  });
});
