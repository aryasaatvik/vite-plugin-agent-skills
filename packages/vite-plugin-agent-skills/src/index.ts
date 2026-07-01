import { promises as fs } from "node:fs";
import * as path from "node:path";

import { normalizePath, type Plugin, transformWithOxc } from "vite";

import {
  assertNoDynamicSkillImports,
  collectAttributedImports,
  isSkillMarkdownPath,
  stripQueryAndHash,
  type ModuleAst,
} from "./attributed-imports";
import { pluginError, pluginName } from "./errors";
import { markdownImportConfig, type MarkdownImportOptions } from "./markdown-import";
import { skillImportConfig, type SkillImportOptions } from "./skill-import";
import { createVirtualModuleIds, decodeSkillModuleId } from "./virtual-modules";

export interface AgentSkillsPluginOptions {
  markdown?: boolean | MarkdownImportOptions;
  skill?: boolean | SkillImportOptions;
}

export type { MarkdownImportOptions } from "./markdown-import";
export type { SkillImportOptions } from "./skill-import";
export type { SkillDirectoryFile, SkillResourceOptions } from "./skill-directory";

export function agentSkills(options: AgentSkillsPluginOptions = {}): Plugin {
  const virtualModules = createVirtualModuleIds();
  const state = {
    markdown: markdownImportConfig(options.markdown),
    skill: skillImportConfig(options.skill),
    viteRoot: "",
  };

  return {
    name: pluginName,
    enforce: "pre",
    configResolved(config) {
      state.viteRoot = config.root;
    },
    async transform(code, id) {
      if (!/\.[cm]?[jt]sx?(?:\?|$)/i.test(id)) return null;

      const importerPath = id.split("?")[0] ?? id;
      if (!containsImportAttribute(code) && !(state.skill.enabled && code.includes("SKILL.md"))) {
        return null;
      }

      const oxcResult = /\.[cm]?tsx?(?:\?|$)/i.test(id)
        ? await transformWithOxc(code, importerPath, {})
        : undefined;
      const parseableCode = oxcResult?.code ?? code;
      const ast = this.parse(parseableCode) as unknown as ModuleAst;
      if (state.skill.enabled) assertNoDynamicSkillImports(ast);

      const replacements = [
        ...(state.markdown.enabled
          ? await markdownImportReplacements({
              imports: collectAttributedImports(ast, state.markdown.attribute),
              importerPath,
              rejectSkillMarkdown: state.markdown.rejectSkillMarkdown,
              root: state.viteRoot,
              markdownPrefix: virtualModules.markdownPrefix,
              resolve: (specifier) => this.resolve(specifier, importerPath, { skipSelf: true }),
            })
          : []),
        ...(state.skill.enabled
          ? await skillImportReplacements({
              imports: collectAttributedImports(ast, state.skill.attribute),
              importerPath,
              skillPrefix: virtualModules.skillPrefix,
              resolve: (specifier) => this.resolve(specifier, importerPath, { skipSelf: true }),
            })
          : []),
      ];

      if (replacements.length === 0) return null;

      let transformed = parseableCode;
      for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
        transformed = `${transformed.slice(0, replacement.start)}${JSON.stringify(replacement.moduleId)}${transformed.slice(replacement.end)}`;
      }

      return { code: transformed, map: oxcResult?.map ?? null };
    },
    resolveId(source, importer) {
      if (source.startsWith(virtualModules.markdownPrefix)) return source;
      const skillModuleId = decodeSkillModuleId(source, virtualModules);
      if (skillModuleId) return skillModuleId;

      if (!importer) return null;
      if (state.skill.enabled && isSkillMarkdownPath(source)) {
        throw pluginError(
          `SKILL.md import "${source}" must use an import attribute: with { type: "${state.skill.attribute}" }.`,
        );
      }

      return null;
    },
    async load(id) {
      if (id.startsWith(virtualModules.markdownPrefix)) {
        const markdownPath = id.slice(virtualModules.markdownPrefix.length);
        this.addWatchFile(markdownPath);
        return `export default ${JSON.stringify(await fs.readFile(markdownPath, "utf8"))};`;
      }

      if (id.startsWith(virtualModules.skillPrefix)) {
        throw pluginError(
          "Skill imports are recognized, but manifest emission is implemented in the next stacked PR.",
        );
      }

      return null;
    },
  };
}

function containsImportAttribute(code: string): boolean {
  return /\bwith\s*\{/.test(code);
}

interface ImportReplacement {
  start: number;
  end: number;
  moduleId: string;
}

interface ResolvedImport {
  id: string;
  external?: boolean | string;
}

async function markdownImportReplacements({
  imports,
  importerPath,
  rejectSkillMarkdown,
  root,
  markdownPrefix,
  resolve,
}: {
  imports: Array<{ specifier: string; start: number; end: number }>;
  importerPath: string;
  rejectSkillMarkdown: boolean;
  root: string;
  markdownPrefix: string;
  resolve: (specifier: string) => Promise<ResolvedImport | null>;
}): Promise<ImportReplacement[]> {
  return Promise.all(
    imports.map(async (declaration) => {
      if (rejectSkillMarkdown && isSkillMarkdownPath(declaration.specifier)) {
        throw pluginError('SKILL.md imports must use an import attribute: with { type: "skill" }.');
      }
      if (!/\.md(?:[?#].*)?$/i.test(declaration.specifier)) {
        throw pluginError(`Markdown imports must target a .md file: ${declaration.specifier}`);
      }

      const resolved = await resolveImportPath({
        specifier: declaration.specifier,
        importerPath,
        root,
        resolve,
      });
      if (rejectSkillMarkdown && isSkillMarkdownPath(resolved.id)) {
        throw pluginError('SKILL.md imports must use an import attribute: with { type: "skill" }.');
      }

      return {
        start: declaration.start,
        end: declaration.end,
        moduleId: `${markdownPrefix}${stripQueryAndHash(resolved.id)}`,
      };
    }),
  );
}

async function skillImportReplacements({
  imports,
  importerPath,
  skillPrefix,
  resolve,
}: {
  imports: Array<{ specifier: string; start: number; end: number }>;
  importerPath: string;
  skillPrefix: string;
  resolve: (specifier: string) => Promise<ResolvedImport | null>;
}): Promise<ImportReplacement[]> {
  return Promise.all(
    imports.map(async (declaration) => {
      if (!isSkillMarkdownPath(declaration.specifier)) {
        throw pluginError(`Skill imports must target a SKILL.md file: ${declaration.specifier}`);
      }

      const resolved = await resolve(declaration.specifier);
      if (!resolved || resolved.external) {
        throw pluginError(
          `Unable to resolve skill import "${declaration.specifier}" from ${importerPath}.`,
        );
      }

      const filesystemPath = stripQueryAndHash(resolved.id);
      if (!path.isAbsolute(filesystemPath)) {
        throw pluginError(
          `Skill imports must resolve to a filesystem path: ${declaration.specifier}`,
        );
      }

      const resolvedPath = normalizePath(filesystemPath);
      if (!isSkillMarkdownPath(resolvedPath)) {
        throw pluginError(
          `Skill imports must resolve to a SKILL.md file: ${declaration.specifier}`,
        );
      }

      return {
        start: declaration.start,
        end: declaration.end,
        moduleId: `${skillPrefix}${resolvedPath}`,
      };
    }),
  );
}

async function resolveImportPath({
  specifier,
  importerPath,
  root,
  resolve,
}: {
  specifier: string;
  importerPath: string;
  root: string;
  resolve: (specifier: string) => Promise<ResolvedImport | null>;
}): Promise<ResolvedImport> {
  const rootRelativePath = specifier.startsWith("/")
    ? path.resolve(root, specifier.slice(1))
    : undefined;
  const resolved = rootRelativePath
    ? { id: rootRelativePath, external: false }
    : await resolve(specifier);

  if (!resolved || resolved.external) {
    throw pluginError(`Unable to resolve markdown import "${specifier}" from ${importerPath}.`);
  }

  return resolved;
}
