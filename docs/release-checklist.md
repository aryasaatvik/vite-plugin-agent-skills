# Release Checklist

Use this before publishing `vite-plugin-agent-skills`.

## Validation

Run:

```sh
bun run build
bun run typecheck
bun run test
bun run lint
bun run format:check
```

## Package Shape

- `package.json` exports `./dist/index.d.ts` and `./dist/index.mjs`.
- `vite` peer dependency remains `^8.0.0`.
- `agents` is not a package dependency; the generated default runtime import is
  `agents/skills`, and consumers provide it when using `mode: "skillSource"`.
- `mode: "manifest"` works without `agents` installed.

## Behavior Checks

- Markdown imports emit raw strings.
- `SKILL.md` imports require `with { type: "skill" }`.
- Dynamic `SKILL.md` imports fail with a clear error.
- Skill resources respect `.gitignore` and still reject symlinks or
  secret-looking files.
- Dev changes under a loaded skill directory invalidate the virtual skill module.
