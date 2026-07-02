import {
  skillResourceConfig,
  type SkillResourceConfig,
  type SkillResourceOptions,
} from "./skill-directory";

export interface SkillImportOptions {
  attribute?: string;
  transform?: {
    importFrom: string;
    importName?: string;
  };
  validate?: "strict" | "warn";
  resources?: SkillResourceOptions;
}

export interface SkillImportConfig {
  attribute: string;
  transform?: {
    importFrom: string;
    importName: string;
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
    transform: configured.transform
      ? {
          importFrom: configured.transform.importFrom,
          importName: configured.transform.importName ?? "transformSkill",
        }
      : undefined,
    validate: configured.validate ?? "strict",
    resources: skillResourceConfig(configured.resources),
  };
}
