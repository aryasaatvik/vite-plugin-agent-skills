declare module "*/SKILL.md" {
  const skill: import("./agent-skill").AgentSkill;
  export default skill;
}

declare module "*.md" {
  const markdown: string;
  export default markdown;
}
