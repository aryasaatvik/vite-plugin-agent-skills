import { randomUUID } from "node:crypto";

const encodedNullPrefix = "__x00__";

export interface VirtualModuleIds {
  markdownPrefix: string;
  skillPrefix: string;
  encodedSkillPrefix: string;
}

export function createVirtualModuleIds(): VirtualModuleIds {
  const token = randomUUID();
  const skillPrefix = `\0vite-plugin-agent-skills:skill:${token}:`;

  return {
    markdownPrefix: "\0vite-plugin-agent-skills:markdown:",
    skillPrefix,
    encodedSkillPrefix: `${encodedNullPrefix}${skillPrefix.slice(1)}`,
  };
}

export function decodeSkillModuleId(
  source: string,
  ids: Pick<VirtualModuleIds, "skillPrefix" | "encodedSkillPrefix">,
): string | undefined {
  if (source.startsWith(ids.skillPrefix)) return source;
  const encodedIndex = source.indexOf(ids.encodedSkillPrefix);
  if (encodedIndex === -1) return undefined;

  return `${ids.skillPrefix}${source.slice(encodedIndex + ids.encodedSkillPrefix.length)}`;
}
