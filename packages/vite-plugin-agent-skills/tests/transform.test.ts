import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { agentSkills } from "../src/index";
import { markdownModulePrefix, skillModulePrefix } from "../src/virtual-modules";

const root = "/project";

interface TransformResult {
  code: string;
  map: { mappings: string; sources: string[] };
}

type ResolveStub = (specifier: string) => Promise<{ id: string; external: boolean } | null>;

const resolveInRoot: ResolveStub = async (specifier) => ({
  id: join(root, specifier.replace(/^\.\//, "")),
  external: false,
});

async function runTransform(
  code: string,
  id: string,
  options?: Parameters<typeof agentSkills>[0],
  resolve: ResolveStub = resolveInRoot,
): Promise<TransformResult | null> {
  const plugin = agentSkills(options);
  (plugin.configResolved as (config: { root: string }) => void)({ root });
  const { handler } = plugin.transform as {
    handler: (
      this: { resolve: ResolveStub },
      code: string,
      id: string,
    ) => Promise<TransformResult | null>;
  };

  return handler.call({ resolve }, code, id);
}

describe("transform", () => {
  it("rewrites attributed specifiers without stripping TypeScript", async () => {
    const result = await runTransform(
      `import note from "./note.md" with { type: "markdown" };
export const value: string = note;`,
      join(root, "entry.ts"),
    );

    expect(result?.code).toContain(
      JSON.stringify(`${markdownModulePrefix}${join(root, "note.md")}`),
    );
    expect(result?.code).toContain("export const value: string = note;");
  });

  it("returns a sourcemap for the rewrite", async () => {
    const result = await runTransform(
      `import note from "./note.md" with { type: "markdown" };
export const value = note;`,
      join(root, "entry.ts"),
    );

    expect(result?.map.mappings.length).toBeGreaterThan(0);
    expect(result?.map.sources).toBeDefined();
  });

  it("rewrites attributed re-exports", async () => {
    const result = await runTransform(
      `export { default as note } from "./note.md" with { type: "markdown" };`,
      join(root, "entry.ts"),
    );

    expect(result?.code).toContain(
      JSON.stringify(`${markdownModulePrefix}${join(root, "note.md")}`),
    );
  });

  it("honors a custom attribute name", async () => {
    const result = await runTransform(
      `import skill from "./skills/review/SKILL.md" with { type: "agent-skill" };
export const value = skill;`,
      join(root, "entry.ts"),
      { skill: { attribute: "agent-skill" } },
    );

    expect(result?.code).toContain(
      JSON.stringify(`${skillModulePrefix}${join(root, "skills/review/SKILL.md")}`),
    );
  });

  it("leaves files with syntax errors to Vite's own pipeline", async () => {
    await expect(
      runTransform(
        `import note from "./note.md" with { type: "markdown" };\nconst =`,
        join(root, "entry.ts"),
      ),
    ).resolves.toBeNull();
  });

  it("returns null when no attributed imports match", async () => {
    await expect(
      runTransform(
        `const withBlock = { with: {} };\nexport default withBlock;`,
        join(root, "entry.ts"),
      ),
    ).resolves.toBeNull();
  });

  it("allows dynamic imports of non-skill modules", async () => {
    await expect(
      runTransform(`export const load = () => import("./module.ts");`, join(root, "entry.ts")),
    ).resolves.toBeNull();
  });

  it("matches string-keyed import attributes", async () => {
    const result = await runTransform(
      `import note from "./note.md" with { "type": "markdown" };
export const value = note;`,
      join(root, "entry.ts"),
    );

    expect(result?.code).toContain(
      JSON.stringify(`${markdownModulePrefix}${join(root, "note.md")}`),
    );
  });

  it("resolves root-absolute markdown specifiers against the Vite root", async () => {
    const result = await runTransform(
      `import note from "/docs/note.md" with { type: "markdown" };
export const value = note;`,
      join(root, "entry.ts"),
      undefined,
      async () => null,
    );

    expect(result?.code).toContain(
      JSON.stringify(`${markdownModulePrefix}${join(root, "docs/note.md")}`),
    );
  });

  it("fails loudly on unresolvable markdown imports", async () => {
    await expect(
      runTransform(
        `import note from "./missing.md" with { type: "markdown" };`,
        join(root, "entry.ts"),
        undefined,
        async () => null,
      ),
    ).rejects.toThrow(/Unable to resolve markdown import "\.\/missing\.md"/);
  });

  it("fails loudly on unresolvable skill imports", async () => {
    await expect(
      runTransform(
        `import skill from "./skills/review/SKILL.md" with { type: "skill" };`,
        join(root, "entry.ts"),
        undefined,
        async () => null,
      ),
    ).rejects.toThrow(/Unable to resolve skill import "\.\/skills\/review\/SKILL\.md"/);
  });

  it("rejects skill imports that resolve outside the filesystem", async () => {
    await expect(
      runTransform(
        `import skill from "./skills/review/SKILL.md" with { type: "skill" };`,
        join(root, "entry.ts"),
        undefined,
        async () => ({ id: "virtual:SKILL.md", external: false }),
      ),
    ).rejects.toThrow(/must resolve to a filesystem path/);
  });

  it("rejects skill imports that resolve away from a SKILL.md file", async () => {
    await expect(
      runTransform(
        `import skill from "./skills/review/SKILL.md" with { type: "skill" };`,
        join(root, "entry.ts"),
        undefined,
        async () => ({ id: join(root, "other.md"), external: false }),
      ),
    ).rejects.toThrow(/must resolve to a SKILL\.md file/);
  });

  it("rejects skill attributes on non-SKILL.md specifiers", async () => {
    await expect(
      runTransform(
        `import skill from "./skills/review/notes.md" with { type: "skill" };`,
        join(root, "entry.ts"),
      ),
    ).rejects.toThrow(/Skill imports must target a SKILL\.md file/);
  });

  it("rejects markdown attributes on SKILL.md specifiers by default", async () => {
    await expect(
      runTransform(
        `import doc from "./skills/review/SKILL.md" with { type: "markdown" };`,
        join(root, "entry.ts"),
      ),
    ).rejects.toThrow(/must use an import attribute: with \{ type: "skill" \}/);
  });

  it("rejects markdown imports that resolve to a SKILL.md file", async () => {
    await expect(
      runTransform(
        `import doc from "./alias.md" with { type: "markdown" };`,
        join(root, "entry.ts"),
        undefined,
        async () => ({ id: join(root, "skills/review/SKILL.md"), external: false }),
      ),
    ).rejects.toThrow(/must use an import attribute: with \{ type: "skill" \}/);
  });
});
