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
});
