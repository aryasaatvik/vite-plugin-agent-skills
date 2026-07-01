# vite-plugin-agent-skills

Vite plugin for importing Markdown and Agent Skills from static import
attributes.

```sh
bun add -D vite-plugin-agent-skills
```

```ts
import { agentSkills } from "vite-plugin-agent-skills";

export default {
  plugins: [agentSkills()],
};
```

```ts
import instructions from "./prompts/editor.md" with { type: "markdown" };
import reviewSkill from "./skills/review/SKILL.md" with { type: "skill" };
```

## What It Does

- Imports `*.md` files as strings with `with { type: "markdown" }`.
- Imports canonical `SKILL.md` files with `with { type: "skill" }`.
- Packages skill resources from `references/`, `scripts/`, `assets/`, and other
  files while respecting `.gitignore`.
- Ships TypeScript module declarations for Markdown and `SKILL.md` imports.

## Packages

| Path                                                                   | Purpose                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [packages/vite-plugin-agent-skills](packages/vite-plugin-agent-skills) | Published npm package, usage docs, config reference, changelog   |
| [examples/basic](examples/basic)                                       | Minimal Vite app that imports Markdown and a `SKILL.md` manifest |
| [docs/release-checklist.md](docs/release-checklist.md)                 | Release validation checklist                                     |

## TypeScript Setup

For projects that import Markdown modules, add the package root types:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "vite-plugin-agent-skills"]
  }
}
```

The shipped declarations type `*.md` imports as `string` and `*/SKILL.md`
imports as `SkillManifest`, matching `mode: "manifest"`.

## Requirements

- Vite `^8.0.0`
- Node `>=24.10.0`
- Bun `>=1.3.2` for this repository's development workflow

## Development

```sh
bun install
bun run build
bun run typecheck
bun run test
bun run lint
bun run format:check
```
