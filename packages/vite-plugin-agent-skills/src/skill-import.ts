import {
  skillResourceConfig,
  type SkillResourceConfig,
  type SkillResourceOptions,
} from "./skill-directory";

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

export interface SkillImportConfig {
  attribute: string;
  mode: "skillSource" | "manifest";
  runtime: {
    importFrom: string;
    fromManifest: string;
  };
  validate: "strict" | "warn";
  resources: SkillResourceConfig;
}

export function skillImportConfig(
  options: boolean | SkillImportOptions | undefined,
): SkillImportConfig | undefined {
  if (options === false) return undefined;
  const configured = typeof options === "object" ? options : {};

  return {
    attribute: configured.attribute ?? "skill",
    mode: configured.mode ?? "skillSource",
    runtime: {
      importFrom: configured.runtime?.importFrom ?? "agents/skills",
      fromManifest: configured.runtime?.fromManifest ?? "fromManifest",
    },
    validate: configured.validate ?? "strict",
    resources: skillResourceConfig(configured.resources),
  };
}
