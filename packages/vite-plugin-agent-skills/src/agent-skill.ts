import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { normalizePath } from "vite";

import { collectSkillDirectoryFiles, type SkillDirectoryFile } from "./skill-directory";
import { parseSkillMarkdown } from "./skill-frontmatter";
import type { SkillImportConfig } from "./skill-import";

export interface AgentSkillResource {
  path: string;
  kind: "reference" | "script" | "asset" | "file";
  size: number;
  encoding: "text" | "base64";
  mimeType?: string;
  content: string;
}

export interface AgentSkill {
  id: string;
  fingerprint: string;
  name: string;
  description: string;
  body: string;
  compatibility?: string;
  license?: string;
  allowedTools?: string;
  metadata?: Record<string, unknown>;
  resources: AgentSkillResource[];
}

export interface BuildAgentSkillOptions {
  skillPath: string;
  viteRoot: string;
  config: SkillImportConfig;
  warn?: (message: string) => void;
}

const textExtensions = new Set([
  ".bash",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const mimeTypes = new Map([
  [".css", "text/css"],
  [".csv", "text/csv"],
  [".html", "text/html"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".md", "text/markdown"],
  [".mjs", "text/javascript"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ts", "text/typescript"],
  [".tsx", "text/typescript"],
  [".txt", "text/plain"],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
]);

export async function buildAgentSkill({
  skillPath,
  viteRoot,
  config,
  warn,
}: BuildAgentSkillOptions): Promise<AgentSkill> {
  const skillDirectory = path.dirname(skillPath);
  const rawContent = await fs.readFile(skillPath, "utf8");
  const parsed = parseSkillMarkdown(rawContent, {
    directoryName: path.basename(skillDirectory),
    path: skillPath,
    validate: config.validate,
    warn,
  });
  const files = await collectSkillDirectoryFiles({
    skillDirectory,
    viteRoot,
    resources: config.resources,
    warn,
  });
  const resources = await Promise.all(files.map(agentSkillResource));

  const entry = {
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    compatibility: parsed.compatibility,
    license: parsed.license,
    allowedTools: parsed.allowedTools,
    metadata: parsed.metadata,
    resources,
  };
  const fingerprint = agentSkillFingerprint(entry);

  return {
    id: `skill:${parsed.name}:${fingerprint.slice(0, 16)}`,
    fingerprint,
    ...entry,
  };
}

export function skillModuleCode(skill: AgentSkill, config: SkillImportConfig): string {
  const skillCode = `const skill = ${JSON.stringify(skill)};`;
  if (!config.transform) return `${skillCode}\nexport default skill;\n`;

  const transform = config.transform.importName;
  if (!isJavaScriptIdentifier(transform)) {
    throw new Error(
      `skill.transform.importName "${transform}" is not a valid JavaScript identifier.`,
    );
  }

  return [
    `import { ${transform} as transformSkill } from ${JSON.stringify(config.transform.importFrom)};`,
    skillCode,
    "export default transformSkill(skill);",
    "",
  ].join("\n");
}

async function agentSkillResource(file: SkillDirectoryFile): Promise<AgentSkillResource> {
  const bytes = await fs.readFile(file.absolutePath);
  const encoding = resourceEncoding(file.path);
  return {
    path: file.path,
    kind: resourceKind(file.path),
    size: file.size,
    encoding,
    mimeType: mimeTypes.get(extensionOf(file.path)),
    content: encoding === "base64" ? bytes.toString("base64") : bytes.toString("utf8"),
  };
}

function agentSkillFingerprint(entry: Omit<AgentSkill, "id" | "fingerprint">): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(entry));
  return hash.digest("hex");
}

function isJavaScriptIdentifier(value: string): boolean {
  return /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(value);
}

function resourceKind(resourcePath: string): "reference" | "script" | "asset" | "file" {
  if (resourcePath.startsWith("references/")) return "reference";
  if (resourcePath.startsWith("scripts/")) return "script";
  if (resourcePath.startsWith("assets/")) return "asset";
  return "file";
}

function resourceEncoding(resourcePath: string): "text" | "base64" {
  if (textExtensions.has(extensionOf(resourcePath))) return "text";
  return "base64";
}

function extensionOf(resourcePath: string): string {
  const file = normalizePath(resourcePath).split("/").at(-1) ?? resourcePath;
  const index = file.lastIndexOf(".");
  if (index === -1) return "";
  return file.slice(index).toLowerCase();
}
