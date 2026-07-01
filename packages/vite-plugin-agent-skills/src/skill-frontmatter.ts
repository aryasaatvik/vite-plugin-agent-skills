import { FAILSAFE_SCHEMA, load } from "js-yaml";

export interface ParsedSkillMarkdown {
  name: string;
  description: string;
  body: string;
  rawContent: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  allowedTools?: string;
}

export interface ParseSkillMarkdownOptions {
  directoryName: string;
  path: string;
  validate: "strict" | "warn";
  warn?: (message: string) => void;
}

export function parseSkillMarkdown(
  content: string,
  options: ParseSkillMarkdownOptions,
): ParsedSkillMarkdown {
  const cleanContent = content.replace(/^\uFEFF/, "");
  const match = cleanContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${options.path} is missing YAML frontmatter.`,
    );
  }

  let raw: unknown;
  try {
    raw = load(match[1] ?? "", { schema: FAILSAFE_SCHEMA });
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${options.path} has invalid YAML frontmatter.${detail}`,
      { cause: error },
    );
  }
  if (!isRecord(raw)) {
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${options.path} frontmatter must be a YAML mapping.`,
    );
  }

  const name = requireString(raw.name, options.path, "name");
  validateSkillName(name, options);
  const description = requireString(raw.description, options.path, "description");
  if ([...description].length > 1_024) {
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${options.path} frontmatter description exceeds 1024 characters.`,
    );
  }

  const compatibility = optionalString(raw.compatibility, options.path, "compatibility");
  if (compatibility !== undefined && [...compatibility].length > 500) {
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${options.path} compatibility must be at most 500 characters.`,
    );
  }

  const parsed: ParsedSkillMarkdown = {
    name,
    description,
    body: (match[2] ?? "").trim(),
    rawContent: cleanContent,
  };
  const license = optionalString(raw.license, options.path, "license");
  if (license !== undefined) parsed.license = license;
  if (compatibility !== undefined) parsed.compatibility = compatibility;
  const metadata = optionalRecord(raw.metadata, options.path, "metadata");
  if (metadata !== undefined) parsed.metadata = metadata;
  const allowedTools = optionalString(raw["allowed-tools"], options.path, "allowed-tools");
  if (allowedTools !== undefined) parsed.allowedTools = allowedTools;

  return parsed;
}

function validateSkillName(name: string, options: ParseSkillMarkdownOptions): void {
  const failures = [
    name.length > 64 ? "name must be at most 64 characters" : undefined,
    /^[a-z0-9-]+$/.test(name)
      ? undefined
      : "name must contain only lowercase ASCII letters, numbers, and hyphens",
    name.startsWith("-") || name.endsWith("-") || name.includes("--")
      ? "name must not start or end with a hyphen or contain consecutive hyphens"
      : undefined,
    name === options.directoryName
      ? undefined
      : `name must match directory "${options.directoryName}"`,
  ].filter((failure): failure is string => failure !== undefined);

  if (failures.length === 0) return;
  const message = `[vite-plugin-agent-skills] Skill ${options.path} frontmatter ${failures.join("; ")}.`;
  if (options.validate === "warn") {
    options.warn?.(message);
    return;
  }
  throw new Error(message);
}

function requireString(value: unknown, path: string, field: string): string {
  const string = optionalString(value, path, field);
  if (string === undefined) {
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${path} must define frontmatter ${field} as a non-empty string.`,
    );
  }
  return string;
}

function optionalString(value: unknown, path: string, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${path} frontmatter ${field} must be a string when provided.`,
    );
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalRecord(
  value: unknown,
  path: string,
  field: string,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new Error(
      `[vite-plugin-agent-skills] Skill ${path} frontmatter ${field} must be a YAML mapping.`,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
