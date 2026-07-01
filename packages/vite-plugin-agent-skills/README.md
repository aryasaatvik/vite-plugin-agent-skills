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

export function getSkills() {
  return [reviewSkill];
}
```

By default, skill imports emit an Agents SDK-compatible `SkillSource` using
`fromManifest` from `agents/skills`. Use `mode: "manifest"` when testing or when
another runtime wants the serializable manifest directly.

```ts
agentSkills({
  skill: {
    mode: "manifest",
  },
});
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
`*/SKILL.md` imports as `SkillManifest`, matching `mode: "manifest"`.
Default `skillSource` mode can return a runtime-specific type from
`runtime.fromManifest`, so projects using that mode should type that runtime
boundary explicitly.

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
        mode?: "skillSource" | "manifest";
        runtime?: {
          importFrom?: string;
          fromManifest?: string;
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
logs and includes the skill in the manifest anyway. Structural frontmatter
errors (missing YAML, invalid YAML, missing required fields) always fail the
build regardless of `validate`.

## Examples

The repo includes a Vite app in `examples/basic` that imports both plain
Markdown and a `SKILL.md` manifest. It configures the plugin in
`mode: "manifest"` so the example can build without an Agents SDK runtime
dependency.

## Development

```sh
bun install
bun run build
bun run typecheck
bun run test
bun run lint
bun run format:check
```
