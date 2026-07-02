# vite-plugin-agent-skills

Vite plugin for importing Markdown and Agent Skills from static import
attributes.

## Requirements

- Vite `^8.0.0`
- Node `>=24.10.0`

## Install

```sh
bun add -D vite-plugin-agent-skills
```

```ts
import { agentSkills } from "vite-plugin-agent-skills";

export default {
  plugins: [agentSkills()],
};
```

## Usage

Import plain Markdown as a string:

```ts
import instructions from "./prompts/editor.md" with { type: "markdown" };
```

Import an Agent Skill from its canonical `SKILL.md` file:

```ts
import reviewSkill from "./skills/review/SKILL.md" with { type: "skill" };

reviewSkill.name;
reviewSkill.description;
reviewSkill.body;
reviewSkill.resources;
reviewSkill.fingerprint;
```

Skill imports export a serializable `AgentSkill`:

```ts
interface AgentSkill {
  id: string;
  fingerprint: string;
  name: string;
  description: string;
  body: string;
  allowedTools?: string;
  compatibility?: string;
  license?: string;
  metadata?: Record<string, unknown>;
  resources: AgentSkillResource[];
}
```

Use `skill.transform` when an app or runtime wants a different export shape:

```ts
agentSkills({
  skill: {
    transform: {
      importFrom: "/src/skill-transform.ts",
      importName: "toPromptSkill",
    },
  },
});
```

The generated module imports `toPromptSkill`, passes it the generated
`AgentSkill`, and exports the return value.

```ts
export function toPromptSkill(skill: AgentSkill) {
  return {
    name: skill.name,
    prompt: skill.body,
    resources: skill.resources,
  };
}
```

Add the package root types to TypeScript projects that import Markdown modules:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "vite-plugin-agent-skills"]
  }
}
```

The shipped module declarations type `*.md` imports as `string` and
`*/SKILL.md` imports as `AgentSkill`. Projects using `skill.transform` can add a
project-local module declaration when they want the transformed export type.

## Config

```ts
interface AgentSkillsPluginOptions {
  markdown?:
    | boolean
    | {
        attribute?: string;
        rejectSkillMarkdown?: boolean;
      };
  skill?:
    | boolean
    | {
        attribute?: string;
        transform?: {
          importFrom: string;
          importName?: string;
        };
        validate?: "strict" | "warn";
        resources?: {
          gitignore?: boolean;
          rejectSecrets?: boolean;
          rejectSymlinks?: boolean;
          largeFile?: {
            bytes?: number;
            action?: "warn" | "error" | "ignore";
          };
        };
      };
}
```

Skill resources respect `.gitignore` by default. Secret-looking files and
symlinks are rejected separately so credentials are not bundled just because a
project forgot to ignore them.

`validate` controls how `SKILL.md` name errors (length, casing, matching the
directory name) are reported: `"strict"` (default) fails the build, `"warn"`
logs and includes the skill anyway. Structural frontmatter
errors (missing YAML, invalid YAML, missing required fields) always fail the
build regardless of `validate`.

## Examples

The repo includes a Vite app in `examples/basic` that imports both plain
Markdown and a `SKILL.md` file.

## Acknowledgements

This plugin is heavily inspired by [Flue](https://github.com/withastro/flue)
and its approach to Vite-powered agent development.

## Development

```sh
bun install
bun run build
bun run typecheck
bun run test
bun run lint
bun run format:check
```
