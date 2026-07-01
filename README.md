# vite-plugin-agent-skills

Vite plugin for importing Markdown and Agent Skills from static import
attributes.

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
