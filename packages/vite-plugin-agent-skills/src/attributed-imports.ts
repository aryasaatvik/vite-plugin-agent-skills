import * as path from "node:path";

import { normalizePath, type ESTree } from "vite";

import { markdownModulePrefix, skillModulePrefix } from "./virtual-modules";

export interface AttributedImport {
  specifier: string;
  start: number;
  end: number;
}

export interface ImportReplacement {
  start: number;
  end: number;
  moduleId: string;
}

export interface ResolvedImport {
  id: string;
  external?: boolean | string;
}

type ResolveSpecifier = (specifier: string) => Promise<ResolvedImport | null>;

type AttributedDeclaration =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration;

export function collectAttributedImports(
  program: ESTree.Program,
  attributeValue: string,
): AttributedImport[] {
  const imports: AttributedImport[] = [];

  for (const statement of program.body) {
    if (!isAttributedDeclaration(statement)) continue;
    if (statement.source === null) continue;
    if (!hasTypeAttribute(statement.attributes, attributeValue)) continue;

    imports.push({
      specifier: statement.source.value,
      start: statement.source.start,
      end: statement.source.end,
    });
  }

  return imports;
}

export function assertNoDynamicSkillImports(program: ESTree.Program): void {
  visitImportExpressions(program, (node) => {
    if (node.source.type !== "Literal") return;
    const specifier = node.source.value;
    if (typeof specifier === "string" && isSkillMarkdownPath(specifier)) {
      throw new Error(
        `Dynamic SKILL.md import "${specifier}" is unsupported. Use a static import with { type: "skill" }.`,
      );
    }
  });
}

export async function markdownImportReplacements({
  imports,
  importerPath,
  rejectSkillMarkdown,
  root,
  resolve,
}: {
  imports: AttributedImport[];
  importerPath: string;
  rejectSkillMarkdown: boolean;
  root: string;
  resolve: ResolveSpecifier;
}): Promise<ImportReplacement[]> {
  return Promise.all(
    imports.map(async (declaration) => {
      if (rejectSkillMarkdown && isSkillMarkdownPath(declaration.specifier)) {
        throw new Error('SKILL.md imports must use an import attribute: with { type: "skill" }.');
      }
      if (!/\.md(?:[?#].*)?$/i.test(declaration.specifier)) {
        throw new Error(`Markdown imports must target a .md file: ${declaration.specifier}`);
      }

      const resolved = await resolveImportPath({
        specifier: declaration.specifier,
        importerPath,
        root,
        resolve,
      });
      if (rejectSkillMarkdown && isSkillMarkdownPath(resolved.id)) {
        throw new Error('SKILL.md imports must use an import attribute: with { type: "skill" }.');
      }

      return {
        start: declaration.start,
        end: declaration.end,
        moduleId: `${markdownModulePrefix}${stripQueryAndHash(resolved.id)}`,
      };
    }),
  );
}

export async function skillImportReplacements({
  imports,
  importerPath,
  resolve,
}: {
  imports: AttributedImport[];
  importerPath: string;
  resolve: ResolveSpecifier;
}): Promise<ImportReplacement[]> {
  return Promise.all(
    imports.map(async (declaration) => {
      if (!isSkillMarkdownPath(declaration.specifier)) {
        throw new Error(`Skill imports must target a SKILL.md file: ${declaration.specifier}`);
      }

      const resolved = await resolve(declaration.specifier);
      if (!resolved || resolved.external) {
        throw new Error(
          `Unable to resolve skill import "${declaration.specifier}" from ${importerPath}.`,
        );
      }

      const filesystemPath = stripQueryAndHash(resolved.id);
      if (!path.isAbsolute(filesystemPath)) {
        throw new Error(
          `Skill imports must resolve to a filesystem path: ${declaration.specifier}`,
        );
      }

      const resolvedPath = normalizePath(filesystemPath);
      if (!isSkillMarkdownPath(resolvedPath)) {
        throw new Error(`Skill imports must resolve to a SKILL.md file: ${declaration.specifier}`);
      }

      return {
        start: declaration.start,
        end: declaration.end,
        moduleId: `${skillModulePrefix}${resolvedPath}`,
      };
    }),
  );
}

export function isSkillMarkdownPath(specifier: string): boolean {
  return stripQueryAndHash(specifier).split("/").at(-1) === "SKILL.md";
}

export function stripQueryAndHash(specifier: string): string {
  return specifier.split(/[?#]/, 1)[0] ?? specifier;
}

function isAttributedDeclaration(
  statement: ESTree.Directive | ESTree.Statement,
): statement is AttributedDeclaration {
  return (
    statement.type === "ImportDeclaration" ||
    statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportAllDeclaration"
  );
}

function hasTypeAttribute(attributes: ESTree.ImportAttribute[], attributeValue: string): boolean {
  return attributes.some(
    (attribute) =>
      importAttributeKey(attribute) === "type" && attribute.value.value === attributeValue,
  );
}

function importAttributeKey(attribute: ESTree.ImportAttribute): string {
  if (attribute.key.type === "Identifier") return attribute.key.name;
  return attribute.key.value;
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
  resolve: ResolveSpecifier;
}): Promise<ResolvedImport> {
  if (specifier.startsWith("/")) {
    return { id: path.resolve(root, specifier.slice(1)), external: false };
  }

  const resolved = await resolve(specifier);
  if (!resolved || resolved.external) {
    throw new Error(`Unable to resolve markdown import "${specifier}" from ${importerPath}.`);
  }

  return resolved;
}

function visitImportExpressions(
  value: unknown,
  visit: (node: ESTree.ImportExpression) => void,
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visitImportExpressions(item, visit);
    return;
  }

  const node = value as Record<string, unknown>;
  if (node.type === "ImportExpression") visit(node as unknown as ESTree.ImportExpression);
  for (const [key, child] of Object.entries(node)) {
    if (key === "start" || key === "end" || key === "loc" || key === "parent") continue;
    visitImportExpressions(child, visit);
  }
}
