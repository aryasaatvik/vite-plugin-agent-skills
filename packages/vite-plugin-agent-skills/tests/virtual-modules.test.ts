import { describe, expect, it } from "vitest";

import { decodeSkillModuleId, type VirtualModuleIds } from "../src/virtual-modules";

describe("virtual module IDs", () => {
  const ids = {
    skillPrefix: "\0vite-plugin-agent-skills:skill:test:",
    encodedSkillPrefix: "__x00__vite-plugin-agent-skills:skill:test:",
  } satisfies Pick<VirtualModuleIds, "skillPrefix" | "encodedSkillPrefix">;

  it("decodes Vite's encoded virtual skill IDs", () => {
    expect(decodeSkillModuleId(`${ids.encodedSkillPrefix}/tmp/skill/SKILL.md`, ids)).toBe(
      `${ids.skillPrefix}/tmp/skill/SKILL.md`,
    );
  });

  it("ignores embedded encoded prefixes", () => {
    expect(decodeSkillModuleId(`prefix-${ids.encodedSkillPrefix}/tmp/skill/SKILL.md`, ids)).toBe(
      undefined,
    );
  });
});
