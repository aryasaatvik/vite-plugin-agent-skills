import { promises as fs } from "node:fs";
import * as path from "node:path";

import ignore, { type Ignore } from "ignore";
import { normalizePath } from "vite";

import { pluginError, pluginMessage } from "./errors";

export interface SkillResourceOptions {
  gitignore?: boolean;
  rejectSecrets?: boolean;
  rejectSymlinks?: boolean;
  largeFile?: {
    bytes?: number;
    action?: "warn" | "error" | "ignore";
  };
}

export interface SkillResourceConfig {
  gitignore: boolean;
  rejectSecrets: boolean;
  rejectSymlinks: boolean;
  largeFile: {
    bytes: number;
    action: "warn" | "error" | "ignore";
  };
}

export interface SkillDirectoryFile {
  path: string;
  absolutePath: string;
  size: number;
}

export interface CollectSkillDirectoryFilesOptions {
  skillDirectory: string;
  viteRoot: string;
  resources?: SkillResourceOptions;
  warn?: (message: string) => void;
}

interface GitignoreScope {
  directory: string;
  matcher: Ignore;
}

interface CollectFilesContext {
  directory: string;
  root: string;
  scopes: GitignoreScope[];
  config: SkillResourceConfig;
  files: SkillDirectoryFile[];
  warn: ((message: string) => void) | undefined;
}

const sensitiveDirectoryNames = new Set([".aws", ".gnupg", ".ssh"]);
const sensitiveFileNames = new Set([
  ".dev.vars",
  ".env",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "_netrc",
  "credentials.json",
]);
const sensitiveFilePatterns = [/\.key$/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i, /^secrets?(?:\.|$)/i];

export function skillResourceConfig(
  options: SkillResourceOptions | undefined,
): SkillResourceConfig {
  return {
    gitignore: options?.gitignore ?? true,
    rejectSecrets: options?.rejectSecrets ?? true,
    rejectSymlinks: options?.rejectSymlinks ?? true,
    largeFile: {
      bytes: options?.largeFile?.bytes ?? 1_048_576,
      action: options?.largeFile?.action ?? "warn",
    },
  };
}

export async function collectSkillDirectoryFiles({
  skillDirectory,
  viteRoot,
  resources,
  warn,
}: CollectSkillDirectoryFilesOptions): Promise<SkillDirectoryFile[]> {
  const config = skillResourceConfig(resources);
  const root = normalizeAbsolutePath(viteRoot);
  const directory = normalizeAbsolutePath(skillDirectory);
  const scopes = config.gitignore ? await gitignoreScopesForAncestors({ root, directory }) : [];
  const files: SkillDirectoryFile[] = [];

  await collectFiles({ directory, root: directory, scopes, config, files, warn });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectFiles({
  directory,
  root,
  scopes,
  config,
  files,
  warn,
}: CollectFilesContext): Promise<void> {
  const currentScopes = config.gitignore
    ? [...scopes, ...(await gitignoreScopesForDirectory(directory))]
    : scopes;
  const entries = await fs.readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = normalizeAbsolutePath(path.join(directory, entry.name));
      const relativePath = normalizePath(path.relative(root, absolutePath));
      if (isGitignored(absolutePath, entry.isDirectory(), currentScopes)) return;

      if (entry.isSymbolicLink()) {
        if (config.rejectSymlinks) {
          throw pluginError(
            `Skill directory "${root}" contains symbolic link "${relativePath}", which cannot be packaged.`,
          );
        }
        return;
      }

      if (entry.isDirectory()) {
        if (config.rejectSecrets && sensitiveDirectoryNames.has(entry.name.toLowerCase())) {
          throw pluginError(
            `Skill directory "${root}" contains sensitive directory "${relativePath}", which cannot be packaged.`,
          );
        }
        await collectFiles({
          directory: absolutePath,
          root,
          scopes: currentScopes,
          config,
          files,
          warn,
        });
        return;
      }

      if (!entry.isFile() || relativePath === "SKILL.md" || entry.name === ".gitignore") return;
      if (config.rejectSecrets && isSensitiveFile(entry.name)) {
        throw pluginError(
          `Skill directory "${root}" contains sensitive file "${relativePath}", which cannot be packaged.`,
        );
      }

      const stat = await fs.stat(absolutePath);
      if (stat.size > config.largeFile.bytes) {
        const message = `Skill resource "${relativePath}" is ${stat.size} bytes and will be embedded in the Vite bundle.`;
        if (config.largeFile.action === "error") throw pluginError(message);
        if (config.largeFile.action === "warn") warn?.(pluginMessage(message));
      }
      files.push({ path: relativePath, absolutePath, size: stat.size });
    }),
  );
}

async function gitignoreScopesForAncestors({
  root,
  directory,
}: {
  root: string;
  directory: string;
}): Promise<GitignoreScope[]> {
  const scopes: GitignoreScope[] = [];
  const rootRelativeDirectory = normalizePath(path.relative(root, directory));
  if (rootRelativeDirectory.startsWith("..")) return scopes;

  const directories = [root];
  if (rootRelativeDirectory) {
    let current = root;
    for (const part of rootRelativeDirectory.split("/")) {
      current = normalizeAbsolutePath(path.join(current, part));
      directories.push(current);
    }
  }

  scopes.push(...(await Promise.all(directories.map(gitignoreScopesForDirectory))).flat());
  return scopes;
}

async function gitignoreScopesForDirectory(directory: string): Promise<GitignoreScope[]> {
  const gitignorePath = path.join(directory, ".gitignore");
  const content = await fs.readFile(gitignorePath, "utf8").catch(() => null);
  if (content === null) return [];

  return [
    {
      directory,
      matcher: ignore().add(content),
    },
  ];
}

function isGitignored(
  absolutePath: string,
  isDirectory: boolean,
  scopes: GitignoreScope[],
): boolean {
  return scopes.some((scope) => {
    const relativePath = normalizePath(path.relative(scope.directory, absolutePath));
    if (!relativePath || relativePath.startsWith("..")) return false;
    return scope.matcher.ignores(isDirectory ? `${relativePath}/` : relativePath);
  });
}

function isSensitiveFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return (
    sensitiveFileNames.has(lowerFilename) ||
    lowerFilename.startsWith(".dev.vars.") ||
    lowerFilename.startsWith(".env.") ||
    sensitiveFilePatterns.some((pattern) => pattern.test(filename))
  );
}

function normalizeAbsolutePath(filePath: string): string {
  return normalizePath(path.resolve(filePath));
}
