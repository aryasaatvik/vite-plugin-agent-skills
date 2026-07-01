declare module "*/SKILL.md" {
  const manifest: import("./skill-manifest").SkillManifest;
  export default manifest;
}

declare module "*.md" {
  const markdown: string;
  export default markdown;
}
