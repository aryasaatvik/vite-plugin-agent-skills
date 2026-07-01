export interface ModuleAst {
  body: unknown[];
}

export interface AttributedImport {
  specifier: string;
  start: number;
  end: number;
}

interface AstNode {
  type?: string;
  source?: {
    value?: unknown;
    start?: number;
    end?: number;
  };
  attributes?: Array<{
    key?: {
      name?: unknown;
      value?: unknown;
    };
    value?: {
      value?: unknown;
    };
  }>;
}

export function collectAttributedImports(
  ast: ModuleAst,
  attributeValue: string,
): AttributedImport[] {
  const imports: AttributedImport[] = [];

  for (const entry of ast.body) {
    const declaration = entry as AstNode;
    if (
      declaration.type !== "ImportDeclaration" &&
      declaration.type !== "ExportNamedDeclaration" &&
      declaration.type !== "ExportAllDeclaration"
    ) {
      continue;
    }

    const specifier = declaration.source?.value;
    if (typeof specifier !== "string") continue;

    const matchesAttribute = declaration.attributes?.some((attribute) => {
      const key = attribute.key?.name ?? attribute.key?.value;
      return key === "type" && attribute.value?.value === attributeValue;
    });
    if (!matchesAttribute) continue;

    const start = declaration.source?.start;
    const end = declaration.source?.end;
    if (typeof start !== "number" || typeof end !== "number") {
      throw new Error(
        `[vite-plugin-agent-skills] Unable to transform attributed import: ${specifier}`,
      );
    }
    imports.push({ specifier, start, end });
  }

  return imports;
}

export function assertNoDynamicSkillImports(ast: ModuleAst): void {
  visitAst(ast, (node) => {
    if (node.type !== "ImportExpression") return;
    const specifier = node.source?.value;
    if (typeof specifier === "string" && isSkillMarkdownPath(specifier)) {
      throw new Error(
        `[vite-plugin-agent-skills] Dynamic SKILL.md import "${specifier}" is unsupported. Use a static import with { type: "skill" }.`,
      );
    }
  });
}

export function isSkillMarkdownPath(specifier: string): boolean {
  return stripQueryAndHash(specifier).split("/").at(-1) === "SKILL.md";
}

export function stripQueryAndHash(specifier: string): string {
  return specifier.split(/[?#]/, 1)[0] ?? specifier;
}

function visitAst(value: unknown, visit: (node: AstNode) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visitAst(item, visit);
    return;
  }

  const node = value as AstNode & Record<string, unknown>;
  if (typeof node.type === "string") visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== "start" && key !== "end" && key !== "loc") visitAst(child, visit);
  }
}
