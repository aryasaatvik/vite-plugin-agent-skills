# Changelog

All notable changes to this package are documented here. Format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Changed

- Breaking: `with { type: "skill" }` imports now export a single serializable
  `AgentSkill` by default instead of a manifest bundle or Agents SDK runtime
  value.
- Breaking: replaced `skill.mode` and `skill.runtime` with `skill.transform`,
  which passes the generated `AgentSkill` through a configured function before
  export.
- `*/SKILL.md` ambient module declarations now type imports as `AgentSkill`.

## 0.1.0

Initial public release.

### Added

- `with { type: "markdown" }` imports, resolving to the file's raw content as
  a `string`.
- `with { type: "skill" }` imports for `SKILL.md` files: name/frontmatter
  validation (`strict`/`warn`), directory packaging with `.gitignore`, secret,
  and symlink checks, and a serializable manifest (`mode: "manifest"`) or an
  Agents SDK `SkillSource` via `fromManifest` (default, `mode: "skillSource"`).
- Dev server support: file watching and `hotUpdate` invalidation for edits to
  a skill's `SKILL.md` or its resource files.
- Ambient TypeScript declarations for `*.md` and `*/SKILL.md` imports, opt-in
  via `"types": ["vite-plugin-agent-skills"]`.
