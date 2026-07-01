import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { normalizePath } from "vite";

import { collectSkillDirectoryFiles } from "./skill-directory";
import { parseSkillMarkdown } from "./skill-frontmatter";
import type { SkillImportConfig } from "./skill-import";

export interface SkillManifestResource {
  path: string;
  kind: "reference" | "script" | "asset" | "file";
  size: number;
  encoding: "text" | "base64";
  mimeType?: string;
  content: string;
}

export interface SkillManifestEntry {
  name: string;
  description: string;
  body: string;
  rawContent: string;
  compatibility?: string;
  license?: string;
  allowedTools?: string;
  metadata?: Record<string, unknown>;
  resources: SkillManifestResource[];
}

export interface SkillManifest {
  id: string;
  fingerprint: string;
  skills: SkillManifestEntry[];
}

export interface BuildSkillManifestOptions {
  skillPath: string;
  viteRoot: string;
  config: Exclude<SkillImportConfig, { enabled: false }>;
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

export async function buildSkillManifest({
  skillPath,
  viteRoot,
  config,
  warn,
}: BuildSkillManifestOptions): Promise<SkillManifest> {
  const skillDirectory = path.dirname(skillPath);
  const rawContent = await fs.readFile(skillPath, "utf8");
  const parseOptions = {
    directoryName: path.basename(skillDirectory),
    path: skillPath,
    validate: config.validate,
  };
  const parsed = parseSkillMarkdown(
    rawContent,
    warn === undefined ? parseOptions : { ...parseOptions, warn },
  );
  const resources = await Promise.all(
    (
      await collectSkillDirectoryFiles(
        warn === undefined
          ? {
              skillDirectory,
              viteRoot,
              resources: config.resources,
            }
          : {
              skillDirectory,
              viteRoot,
              resources: config.resources,
              warn,
            },
      )
    ).map(async (file) => skillManifestResource(file.path, file.absolutePath, file.size)),
  );
  const entry: SkillManifestEntry = {
    ...parsed,
    resources,
  };
  const fingerprint = skillFingerprint(entry);

  return {
    id: `bundle:${parsed.name}:${fingerprint.slice(0, 16)}`,
    fingerprint,
    skills: [entry],
  };
}

export function skillModuleCode(
  manifest: SkillManifest,
  config: Exclude<SkillImportConfig, { enabled: false }>,
): string {
  const manifestCode = `const manifest = ${JSON.stringify(manifest)};`;
  if (config.mode === "manifest") return `${manifestCode}\nexport default manifest;\n`;

  return [
    `import { ${config.runtime.fromManifest} as fromManifest } from ${JSON.stringify(config.runtime.importFrom)};`,
    manifestCode,
    "export default fromManifest(manifest);",
    "",
  ].join("\n");
}

async function skillManifestResource(
  resourcePath: string,
  absolutePath: string,
  size: number,
): Promise<SkillManifestResource> {
  const bytes = await fs.readFile(absolutePath);
  const encoding = resourceEncoding(resourcePath);
  const resource: SkillManifestResource = {
    path: resourcePath,
    kind: resourceKind(resourcePath),
    size,
    encoding,
    content: encoding === "base64" ? bytes.toString("base64") : bytes.toString("utf8"),
  };
  const mimeType = resourceMimeType(resourcePath);
  if (mimeType !== undefined) resource.mimeType = mimeType;
  return resource;
}

function skillFingerprint(entry: SkillManifestEntry): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(entry));
  return hash.digest("hex");
}

function resourceKind(resourcePath: string): "reference" | "script" | "asset" | "file" {
  if (resourcePath.startsWith("references/")) return "reference";
  if (resourcePath.startsWith("scripts/")) return "script";
  if (resourcePath.startsWith("assets/")) return "asset";
  return "file";
}

function resourceEncoding(resourcePath: string): "text" | "base64" {
  return textExtensions.has(extensionOf(resourcePath)) ? "text" : "base64";
}

function resourceMimeType(resourcePath: string): string | undefined {
  return mimeTypes.get(extensionOf(resourcePath));
}

function extensionOf(resourcePath: string): string {
  const file = normalizePath(resourcePath).split("/").at(-1) ?? resourcePath;
  const index = file.lastIndexOf(".");
  return index === -1 ? "" : file.slice(index).toLowerCase();
}
