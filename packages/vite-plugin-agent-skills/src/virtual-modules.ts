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
  if (!source.startsWith(ids.encodedSkillPrefix)) return undefined;

  return `${ids.skillPrefix}${source.slice(ids.encodedSkillPrefix.length)}`;
}
