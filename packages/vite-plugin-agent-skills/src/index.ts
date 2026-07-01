import type { Plugin } from "vite";

import { markdownImportConfig, type MarkdownImportOptions } from "./markdown-import";
import { skillImportConfig, type SkillImportOptions } from "./skill-import";

export interface AgentSkillsPluginOptions {
  markdown?: boolean | MarkdownImportOptions;
  skill?: boolean | SkillImportOptions;
}

export type { MarkdownImportOptions } from "./markdown-import";
export type { SkillImportOptions } from "./skill-import";
export type { SkillDirectoryFile, SkillResourceOptions } from "./skill-directory";

export function agentSkills(options: AgentSkillsPluginOptions = {}): Plugin {
  const state = {
    markdown: markdownImportConfig(options.markdown),
    skill: skillImportConfig(options.skill),
    viteRoot: "",
  };

  return {
    name: "vite-plugin-agent-skills",
    enforce: "pre",
    configResolved(config) {
      state.viteRoot = config.root;
    },
  };
}
