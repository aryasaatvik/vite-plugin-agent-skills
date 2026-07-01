import { describe, expect, it, vi } from "vitest";

import { parseSkillMarkdown } from "../src/skill-frontmatter";

describe("parseSkillMarkdown", () => {
  it("parses spec frontmatter fields with string-like scalars", () => {
    expect(
      parseSkillMarkdown(
        `---
name: review
description: Review source changes.
license: 2.0
compatibility: vite
allowed-tools: read write
metadata:
  version: 1.0
---
Body`,
        { directoryName: "review", path: "/skills/review/SKILL.md", validate: "strict" },
      ),
    ).toEqual({
      name: "review",
      description: "Review source changes.",
      body: "Body",
      rawContent: expect.stringContaining("name: review"),
      license: "2.0",
      compatibility: "vite",
      allowedTools: "read write",
      metadata: { version: "1.0" },
    });
  });

  it("fails loudly when the skill name does not match its directory", () => {
    expect(() =>
      parseSkillMarkdown(
        `---
name: summarize
description: Summarize source changes.
---
Body`,
        { directoryName: "review", path: "/skills/review/SKILL.md", validate: "strict" },
      ),
    ).toThrow(/name must match directory "review"/);
  });

  it("can warn for spec shape mismatches during explicit warn-mode migration", () => {
    const warn = vi.fn();

    const parsed = parseSkillMarkdown(
      `---
name: summarize
description: Summarize source changes.
---
Body`,
      { directoryName: "review", path: "/skills/review/SKILL.md", validate: "warn", warn },
    );

    expect(parsed.name).toBe("summarize");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("name must match directory"));
  });

  it("strips a leading BOM before matching frontmatter", () => {
    const parsed = parseSkillMarkdown("\uFEFF---\nname: review\ndescription: Review.\n---\nBody", {
      directoryName: "review",
      path: "/skills/review/SKILL.md",
      validate: "strict",
    });

    expect(parsed.name).toBe("review");
    expect(parsed.rawContent.startsWith("---")).toBe(true);
  });

  it("treats empty optional strings as absent", () => {
    const parsed = parseSkillMarkdown(
      `---\nname: review\ndescription: Review.\nlicense: "  "\n---\nBody`,
      { directoryName: "review", path: "/skills/review/SKILL.md", validate: "strict" },
    );

    expect(parsed.license).toBeUndefined();
  });

  it("reports every name failure in one error", () => {
    expect(() =>
      parseSkillMarkdown(`---\nname: -Bad Name-\ndescription: Review.\n---\nBody`, {
        directoryName: "review",
        path: "/skills/review/SKILL.md",
        validate: "strict",
      }),
    ).toThrow(
      /lowercase ASCII letters.*; name must not start or end with a hyphen.*; name must match directory "review"/,
    );
  });

  const strictOptions = {
    directoryName: "review",
    path: "/skills/review/SKILL.md",
    validate: "strict",
  } as const;

  it.each([
    ["missing frontmatter", "Body only", /missing YAML frontmatter/],
    ["invalid YAML", "---\nname: [unclosed\n---\nBody", /invalid YAML frontmatter/],
    ["non-mapping frontmatter", "---\n- just\n- a list\n---\nBody", /must be a YAML mapping/],
    [
      "missing name",
      "---\ndescription: Review.\n---\nBody",
      /frontmatter name as a non-empty string/,
    ],
    [
      "missing description",
      "---\nname: review\n---\nBody",
      /frontmatter description as a non-empty string/,
    ],
    [
      "overlong description",
      `---\nname: review\ndescription: ${"d".repeat(1_025)}\n---\nBody`,
      /description exceeds 1024 characters/,
    ],
    [
      "overlong compatibility",
      `---\nname: review\ndescription: Review.\ncompatibility: ${"c".repeat(501)}\n---\nBody`,
      /compatibility must be at most 500 characters/,
    ],
    [
      "non-string license",
      "---\nname: review\ndescription: Review.\nlicense:\n  spdx: MIT\n---\nBody",
      /license must be a string when provided/,
    ],
    [
      "non-mapping metadata",
      "---\nname: review\ndescription: Review.\nmetadata: flat\n---\nBody",
      /metadata must be a YAML mapping/,
    ],
  ])("fails loudly on %s", (_label, content, pattern) => {
    expect(() => parseSkillMarkdown(content, strictOptions)).toThrow(pattern);
  });
});
