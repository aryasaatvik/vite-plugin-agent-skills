import { promises as fs } from "node:fs";
import * as path from "node:path";

import { prefixRegex } from "@rolldown/pluginutils";
import MagicString from "magic-string";
import { normalizePath, parseSync, type EnvironmentModuleNode, type Plugin } from "vite";

import {
  assertNoDynamicSkillImports,
  collectAttributedImports,
  isSkillMarkdownPath,
  markdownImportReplacements,
  skillImportReplacements,
  stripQueryAndHash,
  type ImportReplacement,
} from "./attributed-imports";
import { markdownImportConfig, type MarkdownImportOptions } from "./markdown-import";
import { skillImportConfig, type SkillImportOptions } from "./skill-import";
import { buildSkillManifest, skillModuleCode } from "./skill-manifest";
import {
  decodeSkillModuleId,
  encodedSkillModulePrefix,
  markdownModulePrefix,
  skillModulePrefix,
} from "./virtual-modules";

export interface AgentSkillsPluginOptions {
  markdown?: boolean | MarkdownImportOptions;
  skill?: boolean | SkillImportOptions;
}

export type { MarkdownImportOptions } from "./markdown-import";
export type { SkillImportOptions } from "./skill-import";
export type { SkillDirectoryFile, SkillResourceOptions } from "./skill-directory";

const scriptFilePattern = /\.[cm]?[jt]sx?(?:\?|$)/i;
const importAttributePattern = /\bwith\s*\{/;
const skillMarkdownPattern = /(?:^|\/)SKILL\.md(?:[?#]|$)/;

export function agentSkills(options: AgentSkillsPluginOptions = {}): Plugin {
  const markdown = markdownImportConfig(options.markdown);
  const skill = skillImportConfig(options.skill);
  const skillModulesByDirectory = new Map<string, string>();
  let viteRoot = "";

  return {
    name: "vite-plugin-agent-skills",
    enforce: "pre",
    configResolved(config) {
      viteRoot = config.root;
    },
    transform: {
      filter: {
        id: scriptFilePattern,
        code: [importAttributePattern, /SKILL\.md/],
      },
      async handler(code, id) {
        const importerPath = stripQueryAndHash(id);
        const parsed = parseSync(importerPath, code);
        if (parsed.errors.length > 0) return null;
        if (skill) assertNoDynamicSkillImports(parsed.program);

        const replacements: ImportReplacement[] = [];
        if (markdown) {
          replacements.push(
            ...(await markdownImportReplacements({
              imports: collectAttributedImports(parsed.program, markdown.attribute),
              importerPath,
              rejectSkillMarkdown: markdown.rejectSkillMarkdown,
              root: viteRoot,
              resolve: (specifier) => this.resolve(specifier, importerPath, { skipSelf: true }),
            })),
          );
        }
        if (skill) {
          replacements.push(
            ...(await skillImportReplacements({
              imports: collectAttributedImports(parsed.program, skill.attribute),
              importerPath,
              resolve: (specifier) => this.resolve(specifier, importerPath, { skipSelf: true }),
            })),
          );
        }
        if (replacements.length === 0) return null;

        const source = new MagicString(code);
        for (const replacement of replacements) {
          source.overwrite(
            replacement.start,
            replacement.end,
            JSON.stringify(replacement.moduleId),
          );
        }
        return { code: source.toString(), map: source.generateMap({ hires: "boundary" }) };
      },
    },
    resolveId: {
      filter: {
        id: [
          prefixRegex(markdownModulePrefix),
          prefixRegex(skillModulePrefix),
          prefixRegex(encodedSkillModulePrefix),
          skillMarkdownPattern,
        ],
      },
      handler(source, importer, resolveOptions) {
        if (source.startsWith(markdownModulePrefix)) return source;
        const skillModuleId = decodeSkillModuleId(source);
        if (skillModuleId) return skillModuleId;

        if (!importer) return null;
        // `scan` is set during Vite's dependency-scan pass; it exists at runtime
        // but is stripped from the published resolveId option types as internal.
        const { scan } = resolveOptions as { scan?: boolean };
        if (scan || decodeSkillModuleId(importer)) return null;
        if (skill && isSkillMarkdownPath(source)) {
          this.error(
            `SKILL.md import "${source}" must use an import attribute: with { type: "${skill.attribute}" }.`,
          );
        }
        return null;
      },
    },
    hotUpdate(update) {
      const changedPath = normalizePath(path.resolve(update.file));
      const invalidated: EnvironmentModuleNode[] = [];

      for (const [directory, moduleId] of skillModulesByDirectory) {
        if (!isWithinDirectory(changedPath, directory)) continue;
        const module = this.environment.moduleGraph.getModuleById(moduleId);
        if (module === undefined) continue;
        this.environment.moduleGraph.invalidateModule(module);
        invalidated.push(module);
      }

      if (invalidated.length === 0) return;
      return invalidated;
    },
    load: {
      filter: {
        id: [prefixRegex(markdownModulePrefix), prefixRegex(skillModulePrefix)],
      },
      async handler(id) {
        if (id.startsWith(markdownModulePrefix)) {
          const markdownPath = id.slice(markdownModulePrefix.length);
          this.addWatchFile(markdownPath);
          return `export default ${JSON.stringify(await fs.readFile(markdownPath, "utf8"))};`;
        }
        if (!skill) return null;

        const skillPath = id.slice(skillModulePrefix.length);
        const skillDirectory = normalizePath(path.dirname(skillPath));
        skillModulesByDirectory.set(skillDirectory, id);
        this.addWatchFile(skillPath);
        const manifest = await buildSkillManifest({
          skillPath,
          viteRoot,
          config: skill,
          warn: (message) => this.warn(message),
        });
        for (const entry of manifest.skills) {
          for (const resource of entry.resources) {
            this.addWatchFile(normalizePath(path.join(skillDirectory, resource.path)));
          }
        }
        return skillModuleCode(manifest, skill);
      },
    },
  };
}

function isWithinDirectory(filePath: string, directory: string): boolean {
  return filePath === directory || filePath.startsWith(`${directory}/`);
}
