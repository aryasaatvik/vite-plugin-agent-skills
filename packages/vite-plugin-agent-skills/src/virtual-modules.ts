export const markdownModulePrefix = "\0vite-plugin-agent-skills:markdown:";
export const skillModulePrefix = "\0vite-plugin-agent-skills:skill:";

// Vite serves `\0`-prefixed ids to the browser as `/@id/__x00__{id}`; importer
// paths can reach resolveId in that encoded form.
export const encodedSkillModulePrefix = `__x00__${skillModulePrefix.slice(1)}`;

export function decodeSkillModuleId(source: string): string | undefined {
  if (source.startsWith(skillModulePrefix)) return source;
  if (!source.startsWith(encodedSkillModulePrefix)) return undefined;

  return `${skillModulePrefix}${source.slice(encodedSkillModulePrefix.length)}`;
}
