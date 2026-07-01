export interface MarkdownImportOptions {
  attribute?: string;
  rejectSkillMarkdown?: boolean;
}

export type MarkdownImportConfig =
  | { enabled: false }
  | {
      enabled: true;
      attribute: string;
      rejectSkillMarkdown: boolean;
    };

export function markdownImportConfig(
  options: boolean | MarkdownImportOptions | undefined,
): MarkdownImportConfig {
  if (options === false) return { enabled: false };
  const configured = options === true || options === undefined ? {} : options;

  return {
    enabled: true,
    attribute: configured.attribute ?? "markdown",
    rejectSkillMarkdown: configured.rejectSkillMarkdown ?? true,
  };
}
