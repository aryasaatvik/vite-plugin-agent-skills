import { describe, expect, it } from "vitest";

import {
  decodeSkillModuleId,
  encodedSkillModulePrefix,
  skillModulePrefix,
} from "../src/virtual-modules";

describe("virtual module IDs", () => {
  it("passes through raw virtual skill IDs", () => {
    expect(decodeSkillModuleId(`${skillModulePrefix}/tmp/skill/SKILL.md`)).toBe(
      `${skillModulePrefix}/tmp/skill/SKILL.md`,
    );
  });

  it("decodes Vite's encoded virtual skill IDs", () => {
    expect(decodeSkillModuleId(`${encodedSkillModulePrefix}/tmp/skill/SKILL.md`)).toBe(
      `${skillModulePrefix}/tmp/skill/SKILL.md`,
    );
  });

  it("ignores embedded encoded prefixes", () => {
    expect(decodeSkillModuleId(`prefix-${encodedSkillModulePrefix}/tmp/skill/SKILL.md`)).toBe(
      undefined,
    );
  });
});
