import { promises as fs } from "node:fs";
import * as path from "node:path";

import ignore, { type Ignore } from "ignore";
import { normalizePath } from "vite";

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
  const scopes: GitignoreScope[] = [];
  if (config.gitignore) {
    scopes.push(...(await gitignoreScopesForAncestors({ root, directory })));
  }

  const files = await collectFiles({ directory, root: directory, scopes, config, warn });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectFiles({
  directory,
  root,
  scopes: inheritedScopes,
  config,
  warn,
}: {
  directory: string;
  root: string;
  scopes: GitignoreScope[];
  config: SkillResourceConfig;
  warn?: (message: string) => void;
}): Promise<SkillDirectoryFile[]> {
  const scopes = [...inheritedScopes];
  if (config.gitignore) {
    scopes.push(...(await gitignoreScopesForDirectory(directory)));
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const collected = await Promise.all(
    entries.map(async (entry): Promise<SkillDirectoryFile[]> => {
      const absolutePath = normalizeAbsolutePath(path.join(directory, entry.name));
      const relativePath = normalizePath(path.relative(root, absolutePath));
      if (isGitignored(absolutePath, entry.isDirectory(), scopes)) return [];

      if (entry.isSymbolicLink()) {
        if (config.rejectSymlinks) {
          throw new Error(
            `Skill directory "${root}" contains symbolic link "${relativePath}", which cannot be packaged.`,
          );
        }
        return [];
      }

      if (entry.isDirectory()) {
        if (config.rejectSecrets && sensitiveDirectoryNames.has(entry.name.toLowerCase())) {
          throw new Error(
            `Skill directory "${root}" contains sensitive directory "${relativePath}", which cannot be packaged.`,
          );
        }
        return collectFiles({ directory: absolutePath, root, scopes, config, warn });
      }

      if (!entry.isFile() || relativePath === "SKILL.md" || entry.name === ".gitignore") return [];
      if (config.rejectSecrets && isSensitiveFile(entry.name)) {
        throw new Error(
          `Skill directory "${root}" contains sensitive file "${relativePath}", which cannot be packaged.`,
        );
      }

      const stat = await fs.stat(absolutePath);
      if (stat.size > config.largeFile.bytes) {
        const message = `Skill resource "${relativePath}" is ${stat.size} bytes and will be embedded in the Vite bundle.`;
        if (config.largeFile.action === "error") throw new Error(message);
        if (config.largeFile.action === "warn") warn?.(message);
      }
      return [{ path: relativePath, absolutePath, size: stat.size }];
    }),
  );

  return collected.flat();
}

async function gitignoreScopesForAncestors({
  root,
  directory,
}: {
  root: string;
  directory: string;
}): Promise<GitignoreScope[]> {
  const rootRelativeDirectory = normalizePath(path.relative(root, directory));
  if (rootRelativeDirectory.startsWith("..")) return [];

  const directories = [root];
  if (rootRelativeDirectory) {
    let current = root;
    for (const part of rootRelativeDirectory.split("/")) {
      current = normalizeAbsolutePath(path.join(current, part));
      directories.push(current);
    }
  }

  const scopes = await Promise.all(directories.map(gitignoreScopesForDirectory));
  return scopes.flat();
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
