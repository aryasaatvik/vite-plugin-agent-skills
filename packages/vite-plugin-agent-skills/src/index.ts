import type { Plugin } from "vite";

export interface AgentSkillsPluginOptions {
  markdown?: boolean | MarkdownImportOptions;
  skill?: boolean | SkillImportOptions;
}

export interface MarkdownImportOptions {
  attribute?: string;
  rejectSkillMarkdown?: boolean;
}

export interface SkillImportOptions {
  attribute?: string;
  mode?: "skillSource" | "manifest";
  runtime?: {
    importFrom?: string;
    fromManifest?: string;
  };
  validate?: "strict" | "warn";
  resources?: SkillResourceOptions;
}

export interface SkillResourceOptions {
  include?: string[];
  excludeDirectories?: string[];
  rejectSecrets?: boolean;
  rejectSymlinks?: boolean;
  largeFile?: {
    bytes?: number;
    action?: "warn" | "error" | "ignore";
  };
}

export function agentSkills(options: AgentSkillsPluginOptions = {}): Plugin {
  const normalized = normalizeOptions(options);

  return {
    name: "vite-plugin-agent-skills",
    enforce: "pre",
    configResolved() {
      void normalized;
    },
  };
}

function normalizeOptions(options: AgentSkillsPluginOptions): Required<AgentSkillsPluginOptions> {
  return {
    markdown: normalizeMarkdownOptions(options.markdown),
    skill: normalizeSkillOptions(options.skill),
  };
}

function normalizeMarkdownOptions(
  options: boolean | MarkdownImportOptions | undefined,
): false | Required<MarkdownImportOptions> {
  if (options === false) return false;
  const configured = options === true || options === undefined ? {} : options;
  return {
    attribute: configured.attribute ?? "markdown",
    rejectSkillMarkdown: configured.rejectSkillMarkdown ?? true,
  };
}

function normalizeSkillOptions(options: boolean | SkillImportOptions | undefined):
  | false
  | (Required<Omit<SkillImportOptions, "resources" | "runtime">> & {
      resources: Required<SkillResourceOptions>;
      runtime: Required<NonNullable<SkillImportOptions["runtime"]>>;
    }) {
  if (options === false) return false;
  const configured = options === true || options === undefined ? {} : options;
  return {
    attribute: configured.attribute ?? "skill",
    mode: configured.mode ?? "skillSource",
    runtime: {
      importFrom: configured.runtime?.importFrom ?? "agents/skills",
      fromManifest: configured.runtime?.fromManifest ?? "fromManifest",
    },
    validate: configured.validate ?? "strict",
    resources: {
      include: configured.resources?.include ?? ["**/*"],
      excludeDirectories: configured.resources?.excludeDirectories ?? [
        ".git",
        ".cache",
        ".turbo",
        ".wrangler",
        "dist",
        "node_modules",
      ],
      rejectSecrets: configured.resources?.rejectSecrets ?? true,
      rejectSymlinks: configured.resources?.rejectSymlinks ?? true,
      largeFile: {
        bytes: configured.resources?.largeFile?.bytes ?? 1_048_576,
        action: configured.resources?.largeFile?.action ?? "warn",
      },
    },
  };
}
