export interface MarkdownImportOptions {
  attribute?: string;
  rejectSkillMarkdown?: boolean;
}

export interface MarkdownImportConfig {
  attribute: string;
  rejectSkillMarkdown: boolean;
}

export function markdownImportConfig(
  options: boolean | MarkdownImportOptions | undefined,
): MarkdownImportConfig | undefined {
  if (options === false) return undefined;
  const configured = typeof options === "object" ? options : {};

  return {
    attribute: configured.attribute ?? "markdown",
    rejectSkillMarkdown: configured.rejectSkillMarkdown ?? true,
  };
}
