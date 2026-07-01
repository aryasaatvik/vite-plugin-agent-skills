interface ExampleSkillManifestResource {
  path: string;
  kind: "reference" | "script" | "asset" | "file";
  size: number;
  encoding: "text" | "base64";
  mimeType?: string;
  content: string;
}

interface ExampleSkillManifestEntry {
  name: string;
  description: string;
  body: string;
  compatibility?: string;
  license?: string;
  allowedTools?: string;
  metadata?: Record<string, unknown>;
  resources: ExampleSkillManifestResource[];
}

interface ExampleSkillManifest {
  id: string;
  fingerprint: string;
  skills: ExampleSkillManifestEntry[];
}

declare module "*/SKILL.md" {
  const manifest: ExampleSkillManifest;
  export default manifest;
}

declare module "*.md" {
  const markdown: string;
  export default markdown;
}
