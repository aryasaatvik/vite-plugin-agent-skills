import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build, type Rollup } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { agentSkills } from "../src/index";

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("import attributes", () => {
  it("imports markdown as a string", async () => {
    const root = await createFixtureRoot();
    await writeFile(join(root, "note.md"), "# Hello\n");
    await writeFile(
      join(root, "entry.ts"),
      `import note from "./note.md" with { type: "markdown" };
export const value = note;`,
    );

    const mod = await buildAndImport<{ value: string }>(root);

    expect(mod.value).toBe("# Hello\n");
  });

  it("rejects markdown attributes on non-markdown files", async () => {
    const root = await createFixtureRoot();
    await writeFile(join(root, "note.txt"), "Hello");
    await writeFile(
      join(root, "entry.ts"),
      `import note from "./note.txt" with { type: "markdown" };
export const value = note;`,
    );

    await expect(buildFixture(root)).rejects.toThrow(/Markdown imports must target a \.md file/);
  });

  it("rejects dynamic SKILL.md imports", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `export async function loadSkill() {
  return import("./skills/review/SKILL.md");
}`,
    );

    await expect(buildFixture(root)).rejects.toThrow(/Dynamic SKILL\.md import/);
  });

  it("requires SKILL.md imports to use the skill attribute", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md";
export const value = skill;`,
    );

    await expect(buildFixture(root)).rejects.toThrow(/must use an import attribute/);
  });

  it("recognizes static skill imports before manifest emission exists", async () => {
    const root = await createFixtureRoot();
    await writeSkill(root);
    await writeFile(
      join(root, "entry.ts"),
      `import skill from "./skills/review/SKILL.md" with { type: "skill" };
export const value = skill;`,
    );

    await expect(buildFixture(root)).rejects.toThrow(/manifest emission is implemented/);
  });
});

async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-skills-import-"));
  fixtureRoots.push(root);
  return root;
}

async function writeSkill(root: string): Promise<void> {
  const skillDirectory = join(root, "skills", "review");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    `---
name: review
description: Review source changes.
---

Read the diff and report correctness issues.
`,
  );
}

async function buildAndImport<T>(root: string): Promise<T> {
  const output = await buildFixture(root);
  const chunk = output.find((item): item is Rollup.OutputChunk => item.type === "chunk");
  if (!chunk) throw new Error("Fixture build did not produce an output chunk.");

  return import(`data:text/javascript,${encodeURIComponent(chunk.code)}`) as Promise<T>;
}

async function buildFixture(root: string): Promise<Rollup.OutputBundle> {
  const result = await build({
    root,
    logLevel: "silent",
    plugins: [agentSkills()],
    build: {
      write: false,
      lib: {
        entry: join(root, "entry.ts"),
        formats: ["es"],
        fileName: "entry",
      },
      rollupOptions: {
        external: [/^node:/],
      },
    },
  });

  if (Array.isArray(result)) return result[0]?.output ?? [];
  return result.output;
}
