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

export type SkillImportConfig =
  | { enabled: false }
  | {
      enabled: true;
      attribute: string;
      mode: "skillSource" | "manifest";
      runtime: {
        importFrom: string;
        fromManifest: string;
      };
      validate: "strict" | "warn";
      resources: SkillResourceConfig;
    };

export function skillImportConfig(
  options: boolean | SkillImportOptions | undefined,
): SkillImportConfig {
  if (options === false) return { enabled: false };
  const configured = options === true || options === undefined ? {} : options;

  return {
    enabled: true,
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
